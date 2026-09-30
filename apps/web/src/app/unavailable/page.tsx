import '@/styles/globals.css';

/** Shown to visitors from regions the service does not serve. No locale prefix by design. */
export default function Unavailable() {
  return (
    <html lang="en">
      <body>
        <main className="unavailable">
          <div className="card">
            <h1 lang="ru">Сервис недоступен в вашем регионе</h1>
            <p lang="ru">
              Chronika не работает с пользователями из Российской Федерации. Оплату из этого региона
              мы не принимаем, документы не отправляем.
            </p>
            <hr />
            <h2>Not available in your region</h2>
            <p>
              Chronika does not serve users from the Russian Federation. Payments from this region
              are not accepted and no documents are delivered.
            </p>
            <p className="muted small">chronika.me</p>
          </div>
        </main>
      </body>
    </html>
  );
}
