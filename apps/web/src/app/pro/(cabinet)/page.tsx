export const metadata = { title: 'Отчёты' };

export default function Reports() {
  return (
    <>
      <h1>Отчёты</h1>
      <div className="card">
        <p className="muted">Этот раздел появится в следующем обновлении кабинета.</p>
      </div>
      <div className="card disabled" aria-disabled="true">
        <h3>Пример готового разбора</h3>
        <p className="muted">
          Скоро здесь можно будет открыть готовый разбор и посмотреть, что получит клиент.
        </p>
        <button type="button" className="btn ghost small" style={{ justifySelf: 'start' }} disabled>
          Открыть пример
        </button>
      </div>
    </>
  );
}
