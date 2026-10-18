import Link from 'next/link';
import { ClientForm } from '@/components/pro/ClientForm';
import { proText, titleOf } from '@/lib/pro/locale';

export const generateMetadata = titleOf('newClient');

export default async function NewClient() {
  const t = await proText();
  return (
    <>
      <div className="row">
        <Link href="/clients" className="back" aria-label={t.common.backToClients}>
          ‹
        </Link>
        <h1 className="grow">{t.meta.newClient}</h1>
      </div>
      <ClientForm />
    </>
  );
}
