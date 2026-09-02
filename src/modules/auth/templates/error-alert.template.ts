export interface ErrorAlertTemplateParams {
  status: number;
  method: string;
  path: string;
  userId?: string;
  userMessage: string;
  cause: string;
  timestamp: string;
}

export function getErrorAlertEmailTemplate({
  status,
  method,
  path,
  userId,
  userMessage,
  cause,
  timestamp,
}: ErrorAlertTemplateParams): string {
  const escaped = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Erro no Grana em Ordem</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 12px;">
          <tr>
            <td style="padding: 32px 40px; text-align: center; background-color: #C92A2A; border-radius: 12px 12px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px;">Erro operacional</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 40px; color: #1f2937; font-size: 14px; line-height: 1.6;">
              <p style="margin: 0 0 16px;">Um erro que precisa de atenção aconteceu no Grana em Ordem.</p>
              <table role="presentation" style="width: 100%; border-collapse: collapse; font-size: 13px;">
                <tr>
                  <td style="padding: 6px 0; color: #6b7280; width: 140px;">Quando</td>
                  <td style="padding: 6px 0;">${escaped(timestamp)}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #6b7280;">Status</td>
                  <td style="padding: 6px 0;">${status}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #6b7280;">Rota</td>
                  <td style="padding: 6px 0;">${escaped(method)} ${escaped(path)}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #6b7280;">Usuário</td>
                  <td style="padding: 6px 0;">${escaped(userId || 'não autenticado')}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #6b7280;">Mensagem ao usuário</td>
                  <td style="padding: 6px 0;">${escaped(userMessage)}</td>
                </tr>
              </table>
              <p style="margin: 24px 0 8px; font-weight: 600;">Causa técnica</p>
              <pre style="margin: 0; padding: 12px; background: #f3f4f6; border-radius: 8px; white-space: pre-wrap; word-break: break-word; font-size: 12px;">${escaped(cause)}</pre>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();
}
