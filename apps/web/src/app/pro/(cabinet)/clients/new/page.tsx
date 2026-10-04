import Link from 'next/link';
import { ClientForm } from '@/components/pro/ClientForm';

export const metadata = { title: 'Новый клиент' };

export default function NewClient() {
  return (
    <>
      <div className="row">
        <Link href="/clients" className="back" aria-label="Назад к клиентам">
          ‹
        </Link>
        <h1 className="grow">Новый клиент</h1>
      </div>
      <ClientForm />
    </>
  );
}
