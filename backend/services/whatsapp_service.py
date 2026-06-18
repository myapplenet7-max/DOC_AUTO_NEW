import os
import logging

logger = logging.getLogger(__name__)

ADMIN_WHATSAPP = os.getenv("ADMIN_WHATSAPP", "")
WHATSAPP_API_KEY = os.getenv("WHATSAPP_API_KEY", "")


def _send_whatsapp(to: str, message: str):
    if not ADMIN_WHATSAPP or not WHATSAPP_API_KEY:
        logger.info(f"[WhatsApp stub] To: {to} | Message: {message[:100]}")
        return
    try:
        import httpx
        url = "https://api.whatsapp-business.example.com/send"
        httpx.post(url, json={"to": to, "message": message, "api_key": WHATSAPP_API_KEY}, timeout=5)
    except Exception as e:
        logger.warning(f"WhatsApp send failed: {e}")


def notify_admin_new_payment(user_name: str, user_mobile: str, amount: float,
                              credits: int, payment_id: int, upi_ref: str = None):
    msg = (
        f"🔔 New Payment Request\n"
        f"User: {user_name} ({user_mobile})\n"
        f"Amount: ₹{amount} for {credits} credits\n"
        f"Payment ID: #{payment_id}"
    )
    if upi_ref:
        msg += f"\nUTR: {upi_ref}"
    _send_whatsapp(ADMIN_WHATSAPP, msg)


def notify_user_payment_approved(user_whatsapp: str, user_name: str,
                                  amount: float, credits: int, new_balance: int):
    msg = (
        f"✅ Payment Approved!\n"
        f"Hi {user_name}, your payment of ₹{amount} has been approved.\n"
        f"{credits} credits added. New balance: {new_balance} credits.\n"
        f"Visit DocAuto to process your documents!"
    )
    _send_whatsapp(user_whatsapp, msg)


def notify_user_payment_rejected(user_whatsapp: str, user_name: str,
                                  amount: float, note: str = None):
    msg = (
        f"❌ Payment Rejected\n"
        f"Hi {user_name}, your payment of ₹{amount} was not approved."
    )
    if note:
        msg += f"\nReason: {note}"
    msg += "\nPlease contact support for assistance."
    _send_whatsapp(user_whatsapp, msg)


def notify_admin_bulk_enquiry(user_name: str, user_mobile: str, message: str = None):
    msg = (
        f"📋 Bulk Enquiry\n"
        f"From: {user_name} ({user_mobile})"
    )
    if message:
        msg += f"\nMessage: {message}"
    _send_whatsapp(ADMIN_WHATSAPP, msg)
