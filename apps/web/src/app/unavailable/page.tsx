import '@/styles/globals.css';

/** Shown to visitors from regions the service does not serve. No locale prefix by design. */
export default function Unavailable() {
  return (
    <html lang="en">
      <body>
        <main className="unavailable">
          <div className="card">
            <h1 lang="uk">Сервіс недоступний у вашому регіоні</h1>
            <p lang="uk">
              Natalka не працює з користувачами з Російської Федерації. Оплату з цього регіону ми не
              приймаємо, документи не надсилаємо.
            </p>
            <hr />
            <h2>Not available in your region</h2>
            <p>
              Natalka does not serve users from the Russian Federation. Payments from this region
              are not accepted and no documents are delivered.
            </p>
            <p className="muted small">natalka.app</p>
          </div>
        </main>
      </body>
    </html>
  );
}
