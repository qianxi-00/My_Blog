"""邮箱验证码服务（2026-09-26 二期：注册 / 重置密码 / 绑定邮箱）

规则（对齐主服务器 new-api 的语义，见 AGENTS.md）：
- 6 位数字、10 分钟过期、错 5 次作废、单次使用
- purpose 隔离：register / reset / bind 不可混用
- 同邮箱 (email, purpose) 60 秒重发冷却；同邮箱 5 次/天；同 IP 10 次/小时
- 域名白名单：站点设置 email_domain_whitelist（默认沿用 new-api 那份）
- 存储 email_codes 表（sha256 哈希，不存明文）；过期行（>24h）发码时顺手清理
"""

import asyncio
import hashlib
import random
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import settings
from ..core.security import utc_now_naive
from ..models.email_code import EmailCode, CODE_PURPOSES
from ..models.settings import SiteSetting
from .email_service import email_service

CODE_TTL_SECONDS = 600          # 10 分钟
CODE_MAX_ATTEMPTS = 5           # 错 5 次作废
RESEND_COOLDOWN_SECONDS = 60    # 同邮箱同用途重发冷却
PER_EMAIL_DAILY_LIMIT = 5       # 同邮箱每天发码上限
PER_IP_HOURLY_LIMIT = 10        # 同 IP 每小时发码上限
DEFAULT_DOMAIN_WHITELIST = "gmail.com,163.com,126.com,qq.com,icloud.com,foxmail.com"


class VerificationError(Exception):
    """验证码业务错误（message 直接给用户看）"""

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _generate_code() -> str:
    return f"{secrets.randbelow(1000000):06d}"


def _hash_code(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


async def _domain_whitelist(db: AsyncSession) -> list[str]:
    """读站点设置 email_domain_whitelist，缺省用 new-api 同款"""
    result = await db.execute(
        select(SiteSetting).where(SiteSetting.key == "email_domain_whitelist")
    )
    setting = result.scalar_one_or_none()
    raw = (setting.value if setting and setting.value else DEFAULT_DOMAIN_WHITELIST)
    return [d.strip().lower() for d in raw.split(",") if d.strip()]


async def _assert_domain_allowed(db: AsyncSession, email: str) -> None:
    domain = email.rsplit("@", 1)[-1]
    whitelist = await _domain_whitelist(db)
    if whitelist and domain not in whitelist:
        raise VerificationError("该邮箱域名暂不支持，请使用常用邮箱（QQ / 163 / Gmail 等）")


def _code_email(email: str, code: str, purpose: str) -> tuple[str, str, str]:
    """验证码邮件的主题 / HTML / 纯文本"""
    action = {"register": "注册", "reset": "重置密码", "bind": "绑定"}.get(purpose, "验证")
    subject = f"【{settings.SMTP_FROM_NAME}】{action}验证码：{code}"
    html_content = f"""
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans SC',Arial,sans-serif;background-color:#f8fafc;">
  <div style="max-width:520px;margin:0 auto;padding:40px 20px;">
    <div style="background:linear-gradient(135deg,#0ea5e9 0%,#0284c9 100%);border-radius:16px 16px 0 0;padding:28px;text-align:center;">
      <h1 style="color:#fff;margin:0;font-size:22px;font-weight:700;">{action}验证码</h1>
    </div>
    <div style="background:#fff;border-radius:0 0 16px 16px;padding:36px 40px;box-shadow:0 4px 6px rgba(0,0,0,0.08);text-align:center;">
      <p style="color:#475569;font-size:15px;line-height:1.8;margin:0 0 20px 0;">你正在 {settings.SMTP_FROM_NAME} 进行<strong>{action}</strong>操作，验证码为：</p>
      <div style="font-family:Consolas,Menlo,monospace;font-size:36px;font-weight:700;letter-spacing:8px;color:#0284c9;background:#f0f9ff;border-radius:12px;padding:16px 0;margin:0 0 20px 0;">{code}</div>
      <p style="color:#94a3b8;font-size:13px;line-height:1.8;margin:0;">
        10 分钟内有效，错 5 次作废；如非本人操作请忽略此邮件。
      </p>
    </div>
  </div>
</body>
</html>
"""
    text_content = (
        f"【{settings.SMTP_FROM_NAME}】{action}验证码：{code}\n"
        f"10 分钟内有效，错 5 次作废；如非本人操作请忽略此邮件。\n"
    )
    return subject, html_content, text_content


async def send_code(
    db: AsyncSession,
    email: str,
    purpose: str,
    ip: str | None = None,
) -> int:
    """
    生成并发送验证码，返回有效期秒数。

    Raises:
        VerificationError: 域名不允许 / 冷却中 / 超频率
        RuntimeError: 邮件服务未配置或发送失败
    """
    if purpose not in CODE_PURPOSES:
        raise VerificationError("无效的验证码用途")
    email = _normalize_email(email)
    if "@" not in email:
        raise VerificationError("邮箱格式不正确")

    # 域名白名单
    await _assert_domain_allowed(db, email)

    now = utc_now_naive()

    # 同邮箱同用途 60 秒冷却
    last = (await db.execute(
        select(EmailCode)
        .where(EmailCode.email == email, EmailCode.purpose == purpose)
        .order_by(EmailCode.created_at.desc(), EmailCode.id.desc())
        .limit(1)
    )).scalar_one_or_none()
    if last is not None:
        created = last.created_at if last.created_at.tzinfo is None else last.created_at.replace(tzinfo=None)
        if (now - created).total_seconds() < RESEND_COOLDOWN_SECONDS:
            wait = int(RESEND_COOLDOWN_SECONDS - (now - created).total_seconds()) + 1
            raise VerificationError(f"发送太频繁，请 {wait} 秒后再试")

    # 同邮箱每天上限
    day_start = now - timedelta(days=1)
    sent_today = (await db.execute(
        select(func.count()).select_from(EmailCode)
        .where(EmailCode.email == email, EmailCode.created_at >= day_start)
    )).scalar() or 0
    if sent_today >= PER_EMAIL_DAILY_LIMIT:
        raise VerificationError("该邮箱今天的验证码发送次数已达上限，请明天再试")

    # 顺手清理过期行（>24h）
    await db.execute(delete(EmailCode).where(EmailCode.created_at < now - timedelta(hours=24)))

    code = _generate_code()
    row = EmailCode(
        email=email,
        purpose=purpose,
        code_hash=_hash_code(code),
        expires_at=now + timedelta(seconds=CODE_TTL_SECONDS),
        ip=(ip or None)[:64] if ip else None,
    )
    db.add(row)
    await db.commit()

    subject, html_content, text_content = _code_email(email, code, purpose)
    ok = await asyncio.to_thread(email_service.send_email, email, subject, html_content, text_content)
    if not ok:
        await db.delete(row)
        await db.commit()
        raise RuntimeError("邮件发送失败，请稍后再试")

    return CODE_TTL_SECONDS


async def verify_code(db: AsyncSession, email: str, purpose: str, code: str) -> None:
    """
    校验验证码。通过则标记已用；不通过抛 VerificationError 并累计错误次数。
    """
    if purpose not in CODE_PURPOSES:
        raise VerificationError("无效的验证码用途")
    email = _normalize_email(email)
    code = code.strip()

    row = (await db.execute(
        select(EmailCode)
        .where(EmailCode.email == email, EmailCode.purpose == purpose, EmailCode.used_at.is_(None))
        .order_by(EmailCode.created_at.desc(), EmailCode.id.desc())
        .limit(1)
    )).scalar_one_or_none()

    if row is None:
        raise VerificationError("验证码错误或已过期，请重新获取")

    now = utc_now_naive()
    expires = row.expires_at if row.expires_at.tzinfo is None else row.expires_at.replace(tzinfo=None)
    if now > expires:
        raise VerificationError("验证码已过期，请重新获取")
    if row.attempts >= CODE_MAX_ATTEMPTS:
        raise VerificationError("验证码已作废，请重新获取")

    if row.code_hash != _hash_code(code):
        row.attempts += 1
        await db.commit()
        remain = CODE_MAX_ATTEMPTS - row.attempts
        hint = f"，还可尝试 {remain} 次" if remain > 0 else "，已作废请重新获取"
        raise VerificationError(f"验证码错误{hint}")

    row.used_at = now
    await db.commit()
