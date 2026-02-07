import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY 
  ? new Resend(process.env.RESEND_API_KEY) 
  : null;

const FROM_EMAIL = 'onboarding@resend.dev'; // Replace with your domain if verified, e.g., 'receipts@sparkstage.id'

export async function sendOrderEmail({
  to,
  name,
  orderId,
  amount,
  items,
  type,
  queueNumber
}: {
  to: string;
  name: string;
  orderId: string;
  amount: number;
  items: { name: string; qty: number; price: number }[];
  type: 'ORDER_PLACED' | 'PAYMENT_RECEIVED';
  queueNumber: number;
}) {
  if (!resend) {
    console.warn("RESEND_API_KEY missing, skipping email.");
    return;
  }

  const subject = 
    type === 'PAYMENT_RECEIVED' 
      ? `E-Receipt: Order ${orderId}` 
      : `Menunggu Pembayaran: Order ${orderId}`;

  const title = 
    type === 'PAYMENT_RECEIVED' 
      ? 'Pembayaran Berhasil' 
      : 'Menunggu Pembayaran';

  const message = 
    type === 'PAYMENT_RECEIVED'
      ? 'Terima kasih telah melakukan pembayaran. Berikut adalah rincian pesanan Anda.'
      : 'Pesanan Anda telah dibuat. Silakan lakukan pembayaran di kasir untuk memproses pesanan ini.';

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: sans-serif; line-height: 1.5; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px; }
          .header { text-align: center; margin-bottom: 20px; }
          .title { font-size: 24px; font-weight: bold; color: #ff4b86; }
          .info { margin-bottom: 20px; background: #f9f9f9; padding: 15px; border-radius: 8px; }
          .details { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          .details th, .details td { padding: 10px; text-align: left; border-bottom: 1px solid #eee; }
          .total { font-size: 18px; font-weight: bold; text-align: right; padding-top: 10px; }
          .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #888; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 class="title">${title}</h1>
            <p>Halo ${name},</p>
            <p>${message}</p>
          </div>

          <div class="info">
            <p><strong>Order ID:</strong> ${orderId}</p>
            <p><strong>Nomor Antrian:</strong> <span style="font-size: 1.2em; font-weight: bold;">${queueNumber}</span></p>
          </div>

          <table class="details">
            <thead>
              <tr>
                <th>Item</th>
                <th>Qty</th>
                <th>Harga</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(item => `
                <tr>
                  <td>${item.name}</td>
                  <td>${item.qty}</td>
                  <td>Rp${new Intl.NumberFormat('id-ID').format(item.price)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="total">
            Total: Rp${new Intl.NumberFormat('id-ID').format(amount)}
          </div>

          <div class="footer">
            <p>Simpan email ini sebagai bukti pesanan Anda.</p>
            <p>&copy; ${new Date().getFullYear()} Spark Stage Print</p>
          </div>
        </div>
      </body>
    </html>
  `;

  try {
    const data = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
    });
    console.log("Email sent:", data);
    return data;
  } catch (error) {
    console.error("Email send error:", error);
    return null;
  }
}
