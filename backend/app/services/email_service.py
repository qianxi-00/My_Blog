"""
邮件发送服务
"""

import logging
import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.header import Header
from email.utils import formataddr
from typing import Optional

from ..core.config import settings

logger = logging.getLogger(__name__)


def _resolve_use_ssl(port: int) -> bool:
    """结合显式配置与端口惯例推导 SSL / STARTTLS 模式。"""
    if "SMTP_USE_SSL" in settings.model_fields_set:
        return bool(settings.SMTP_USE_SSL)
    if int(port) == 587:
        return False
    if settings.SMTP_USE_TLS is True and int(port) != 465:
        return False
    return bool(settings.SMTP_USE_SSL)


def _mask_user(user: str) -> str:
    if not user:
        return ""
    if "@" in user:
        local, domain = user.split("@", 1)
        prefix = local[:2] if len(local) > 2 else local[:1]
        return f"{prefix}***@{domain}"
    prefix = user[:2] if len(user) > 2 else user[:1]
    return f"{prefix}***"


class EmailService:
    """邮件发送服务"""

    def __init__(self):
        self.host = settings.SMTP_HOST
        self.port = settings.SMTP_PORT
        self.user = settings.SMTP_USER
        self.password = settings.SMTP_PASSWORD
        self.from_email = settings.SMTP_FROM_EMAIL or settings.SMTP_USER
        self.from_name = settings.SMTP_FROM_NAME
        self.use_ssl = _resolve_use_ssl(self.port)
        self.timeout = max(5, int(getattr(settings, "SMTP_TIMEOUT_SECONDS", 15) or 15))
        self.site_url = settings.SITE_URL

    def is_configured(self) -> bool:
        """检查邮件服务是否已配置"""
        return bool(self.host and self.user and self.password)

    def get_status_summary(self) -> dict:
        """返回脱敏的 SMTP 配置状态摘要（绝不返回密码）"""
        return {
            "configured": self.is_configured(),
            "host": self.host or "",
            "port": int(self.port or 465),
            "from_email": self.from_email or "",
            "from_name": self.from_name or "",
            "mode": "SSL" if self.use_ssl else "STARTTLS",
            "user_masked": _mask_user(self.user),
        }

    def _create_message(
        self,
        to_email: str,
        subject: str,
        html_content: str,
        text_content: Optional[str] = None,
    ) -> MIMEMultipart:
        """创建邮件消息"""
        message = MIMEMultipart("alternative")
        message["Subject"] = Header(subject, "utf-8")
        # 使用 formataddr 正确编码中文发件人名称
        message["From"] = formataddr((str(Header(self.from_name, "utf-8")), self.from_email))
        message["To"] = to_email

        # 添加纯文本版本（备用）
        if text_content:
            part1 = MIMEText(text_content, "plain", "utf-8")
            message.attach(part1)

        # 添加 HTML 版本
        part2 = MIMEText(html_content, "html", "utf-8")
        message.attach(part2)

        return message

    def send_email_with_error(
        self,
        to_email: str,
        subject: str,
        html_content: str,
        text_content: Optional[str] = None,
    ) -> tuple[bool, Optional[str]]:
        """发送邮件，返回 (是否成功, 失败原因)。"""
        if not self.is_configured():
            msg = "邮件服务未配置（缺少 SMTP_HOST / SMTP_USER / SMTP_PASSWORD 环境变量）"
            logger.warning("⚠️ %s", msg)
            return False, msg

        message = self._create_message(to_email, subject, html_content, text_content)
        timeout = max(5, int(getattr(self, "timeout", 15) or 15))

        try:
            context = ssl.create_default_context()
            if self.use_ssl:
                # SSL 连接（端口 465）
                with smtplib.SMTP_SSL(self.host, self.port, context=context, timeout=timeout) as server:
                    server.login(self.user, self.password)
                    server.sendmail(self.from_email, to_email, message.as_string())
            else:
                # STARTTLS 连接（端口 587 等）
                with smtplib.SMTP(self.host, self.port, timeout=timeout) as server:
                    server.ehlo()
                    server.starttls(context=context)
                    server.ehlo()
                    server.login(self.user, self.password)
                    server.sendmail(self.from_email, to_email, message.as_string())

            logger.info("✅ 邮件已发送至 %s", to_email)
            return True, None
        except Exception as e:
            err = f"{type(e).__name__}: {e}"
            logger.exception("❌ 邮件发送失败 (host=%s port=%s ssl=%s): %s", self.host, self.port, self.use_ssl, e)
            return False, err

    def send_email(
        self,
        to_email: str,
        subject: str,
        html_content: str,
        text_content: Optional[str] = None,
    ) -> bool:
        """发送邮件（兼容既有 bool 返回约定）"""
        ok, _ = self.send_email_with_error(to_email, subject, html_content, text_content)
        return ok

    def send_test_email(self, to_email: str) -> tuple[bool, Optional[str]]:
        """发送管理后台测试邮件"""
        subject = f"【{self.from_name}】SMTP 邮件服务连通性测试"
        html_content = (
            f"<div style=\"font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:24px;max-width:520px;margin:0 auto;\">"
            f"<h2 style=\"margin:0 0 12px;color:#0f172a;\">SMTP 邮件发送正常</h2>"
            f"<p style=\"color:#475569;font-size:14px;line-height:1.7;margin:0 0 12px;\">"
            f"这是一封来自 <strong>{self.from_name}</strong> 后台站点设置的测试邮件，用于确认容器 SMTP 通道连通性与发件权限。</p>"
            f"<p style=\"color:#64748b;font-size:12px;margin:0;\">SMTP 主机：{self.host}:{self.port}（{'SSL' if self.use_ssl else 'STARTTLS'}）</p>"
            f"</div>"
        )
        text_content = (
            f"这是来自 {self.from_name} 的 SMTP 邮件服务测试邮件。\n"
            f"主机：{self.host}:{self.port}（{'SSL' if self.use_ssl else 'STARTTLS'}）\n"
        )
        return self.send_email_with_error(to_email, subject, html_content, text_content)

    def send_welcome_email(self, to_email: str, unsubscribe_token: str) -> bool:
        """
        发送欢迎订阅邮件
        """
        unsubscribe_url = f"{self.site_url}/#/unsubscribe/{unsubscribe_token}"
        
        subject = f"🎉 感谢订阅 {self.from_name}！"
        
        html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8fafc;">
    <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 16px 16px 0 0; padding: 40px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700;">🎉 订阅成功！</h1>
        </div>
        <div style="background: white; border-radius: 0 0 16px 16px; padding: 40px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
            <p style="color: #334155; font-size: 16px; line-height: 1.8; margin: 0 0 20px 0;">
                你好！👋
            </p>
            <p style="color: #334155; font-size: 16px; line-height: 1.8; margin: 0 0 20px 0;">
                感谢你订阅 <strong>{self.from_name}</strong>！从现在开始，每当有新文章发布，你都会收到邮件通知。
            </p>
            <p style="color: #334155; font-size: 16px; line-height: 1.8; margin: 0 0 30px 0;">
                我会不定期分享：
            </p>
            <ul style="color: #475569; font-size: 15px; line-height: 2; margin: 0 0 30px 0; padding-left: 20px;">
                <li>📚 最新的技术文章和教程</li>
                <li>💡 编程心得和实践经验</li>
                <li>🤖 AI 领域的探索与思考</li>
            </ul>
            <div style="text-align: center; margin: 30px 0;">
                <a href="{self.site_url}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                    访问博客
                </a>
            </div>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
            <p style="color: #94a3b8; font-size: 13px; text-align: center; margin: 0;">
                如果你不想再收到邮件，可以 <a href="{unsubscribe_url}" style="color: #667eea;">取消订阅</a>
            </p>
        </div>
    </div>
</body>
</html>
"""
        
        text_content = f"""
感谢订阅 {self.from_name}！

从现在开始，每当有新文章发布，你都会收到邮件通知。

访问博客：{self.site_url}

如果你不想再收到邮件，请访问：{unsubscribe_url}
"""
        
        return self.send_email(to_email, subject, html_content, text_content)
    
    def send_new_article_notification(
        self, 
        to_email: str, 
        unsubscribe_token: str,
        article_title: str,
        article_summary: str,
        article_url: str
    ) -> bool:
        """
        发送新文章通知邮件
        """
        unsubscribe_url = f"{self.site_url}/#/unsubscribe/{unsubscribe_token}"
        
        subject = f"📝 新文章：{article_title}"
        
        html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8fafc;">
    <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 16px 16px 0 0; padding: 30px; text-align: center;">
            <p style="color: rgba(255,255,255,0.9); margin: 0 0 8px 0; font-size: 14px;">📝 新文章发布</p>
            <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700; line-height: 1.4;">{article_title}</h1>
        </div>
        <div style="background: white; border-radius: 0 0 16px 16px; padding: 40px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
            <p style="color: #475569; font-size: 16px; line-height: 1.8; margin: 0 0 30px 0;">
                {article_summary}
            </p>
            <div style="text-align: center; margin: 30px 0;">
                <a href="{article_url}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                    阅读全文
                </a>
            </div>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
            <p style="color: #94a3b8; font-size: 13px; text-align: center; margin: 0;">
                <a href="{unsubscribe_url}" style="color: #667eea;">取消订阅</a>
            </p>
        </div>
    </div>
</body>
</html>
"""
        
        text_content = f"""
新文章：{article_title}

{article_summary}

阅读全文：{article_url}

取消订阅：{unsubscribe_url}
"""
        
        return self.send_email(to_email, subject, html_content, text_content)


# 全局邮件服务实例
email_service = EmailService()
