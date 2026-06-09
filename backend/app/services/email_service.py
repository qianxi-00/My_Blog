"""
邮件发送服务
"""

import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.header import Header
from email.utils import formataddr
from typing import Optional

from ..core.config import settings


class EmailService:
    """邮件发送服务"""
    
    def __init__(self):
        self.host = settings.SMTP_HOST
        self.port = settings.SMTP_PORT
        self.user = settings.SMTP_USER
        self.password = settings.SMTP_PASSWORD
        self.from_email = settings.SMTP_FROM_EMAIL or settings.SMTP_USER
        self.from_name = settings.SMTP_FROM_NAME
        self.use_ssl = settings.SMTP_USE_SSL
        self.site_url = settings.SITE_URL
    
    def is_configured(self) -> bool:
        """检查邮件服务是否已配置"""
        return bool(self.host and self.user and self.password)
    
    def _create_message(
        self, 
        to_email: str, 
        subject: str, 
        html_content: str,
        text_content: Optional[str] = None
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
    
    def send_email(
        self, 
        to_email: str, 
        subject: str, 
        html_content: str,
        text_content: Optional[str] = None
    ) -> bool:
        """
        发送邮件
        
        Args:
            to_email: 收件人邮箱
            subject: 邮件主题
            html_content: HTML 内容
            text_content: 纯文本内容（可选）
        
        Returns:
            是否发送成功
        """
        if not self.is_configured():
            print("⚠️ 邮件服务未配置，跳过发送")
            return False
        
        message = self._create_message(to_email, subject, html_content, text_content)
        
        try:
            if self.use_ssl:
                # SSL 连接（端口 465）
                context = ssl.create_default_context()
                with smtplib.SMTP_SSL(self.host, self.port, context=context) as server:
                    server.login(self.user, self.password)
                    server.sendmail(self.from_email, to_email, message.as_string())
            else:
                # TLS 连接（端口 587）
                with smtplib.SMTP(self.host, self.port) as server:
                    server.starttls()
                    server.login(self.user, self.password)
                    server.sendmail(self.from_email, to_email, message.as_string())
            
            print(f"✅ 邮件已发送至 {to_email}")
            return True
        except Exception as e:
            print(f"❌ 邮件发送失败: {e}")
            return False
    
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
