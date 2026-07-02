// Branded transactional email templates (from the Minyanim design project). RTL, table-based
// for email-client compatibility. Inline literal colors are required (email clients ignore
// CSS vars / external styles) and mirror the Jerusalem Stone palette.

function shell(opts: { title: string; preview: string; icon: string; heading: string; body: string; ctaText: string; url: string; afterCta: string }): string {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html dir="rtl" lang="he" xmlns="http://www.w3.org/1999/xhtml"><head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<meta name="color-scheme" content="light"/><title>${opts.title}</title></head>
<body style="margin:0;padding:0;background:#f0ece0;font-family:Arial,Helvetica,sans-serif;direction:rtl;">
<div style="display:none;font-size:1px;color:#f0ece0;max-height:0;max-width:0;opacity:0;overflow:hidden;">${opts.preview}</div>
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f0ece0"><tr><td align="center" style="padding:40px 16px;">
<table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">
<tr><td style="background:#f6f1e7;border-radius:18px 18px 0 0;padding:22px 32px;border-bottom:1px solid #ece2cf;">
<table cellpadding="0" cellspacing="0" border="0"><tr>
<td width="36" height="36" style="background:#a4512e;border-radius:10px;text-align:center;vertical-align:middle;"><span style="font-size:20px;font-weight:bold;color:#fff;line-height:36px;">מ</span></td>
<td style="padding-right:10px;vertical-align:middle;"><span style="font-size:20px;font-weight:bold;color:#2b2620;">מניין</span></td>
</tr></table></td></tr>
<tr><td style="background:#fffdf8;padding:36px 32px 30px;">
<table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;"><tr><td width="60" height="60" style="background:#f7e7df;border-radius:16px;text-align:center;vertical-align:middle;"><span style="font-size:28px;line-height:60px;">${opts.icon}</span></td></tr></table>
<h1 style="margin:0 0 14px;font-size:26px;font-weight:800;color:#2b2620;line-height:1.2;">${opts.heading}</h1>
<p style="margin:0 0 26px;font-size:16px;color:#6f695d;line-height:1.68;">${opts.body}</p>
<table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;"><tr><td style="background:#a4512e;border-radius:13px;">
<a href="${opts.url}" target="_blank" style="display:inline-block;padding:15px 32px;font-size:16px;font-weight:800;color:#fff;text-decoration:none;letter-spacing:-0.01em;">${opts.ctaText}</a></td></tr></table>
<p style="margin:0 0 20px;font-size:13px;color:#776c57;line-height:1.55;">אם הכפתור אינו פועל, העתיקו את הקישור הבא לדפדפן:</p>
<p style="margin:0 0 28px;font-size:12px;color:#a4512e;word-break:break-all;direction:ltr;text-align:left;"><a href="${opts.url}" style="color:#a4512e;">${opts.url}</a></p>
${opts.afterCta}
<hr style="border:none;border-top:1px solid #ece2cf;margin:0 0 22px;"/>
<p style="margin:0;font-size:12px;color:#a89a7e;line-height:1.65;">© 2026 מניין · כל הזכויות שמורות</p>
</td></tr></table></td></tr></table></body></html>`;
}

export function verificationEmail(url: string) {
  return {
    subject: "אמתו את כתובת האימייל שלכם · מניין",
    html: shell({
      title: "אמתו את כתובת האימייל שלכם · מניין",
      preview: "אמתו את כתובת האימייל שלכם כדי להשלים את ההרשמה למניין.",
      icon: "✉",
      heading: "אמתו את כתובת האימייל שלכם",
      body: "תודה שנרשמתם למניין! כדי להשלים את ההרשמה ולהתחיל לגלות מניינים בנסיעות שלכם, לחצו על הכפתור למטה.",
      ctaText: "אמתו את האימייל",
      url,
      afterCta: `<p style="margin:0 0 8px;font-size:13px;color:#776c57;">הקישור תקף ל-24 שעות.</p>`,
    }),
  };
}

export function resetPasswordEmail(url: string) {
  return {
    subject: "איפוס סיסמה · מניין",
    html: shell({
      title: "איפוס סיסמה · מניין",
      preview: "קיבלנו בקשה לאיפוס הסיסמה שלכם. הקישור תקף לשעה.",
      icon: "🔑",
      heading: "איפוס סיסמה",
      body: "קיבלנו בקשה לאיפוס הסיסמה עבור חשבון מניין שלכם. לחצו על הכפתור למטה כדי לבחור סיסמה חדשה.",
      ctaText: "אפסו את הסיסמה",
      url,
      afterCta: `<table cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-bottom:22px;"><tr><td style="background:#f7e7df;border-radius:11px;padding:14px 16px;border-right:3px solid #a4512e;"><p style="margin:0;font-size:13.5px;color:#8b3d1f;line-height:1.55;font-weight:600;">לא ביקשתם לאפס את הסיסמה? התעלמו מהודעה זו — סיסמתכם תישאר ללא שינוי.</p></td></tr></table>`,
    }),
  };
}
