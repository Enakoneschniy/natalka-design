/** The contract as the buyer is told it.
 *
 * Two things the law ties to the moment of payment. The payment page asks the buyer to consent to
 * the document being made at once, which is what lets the right of withdrawal lapse. And the
 * confirmation of the contract (§ 312f BGB, Art. 8(7) of the Consumer Rights Directive) has to
 * reach them on a durable medium — a letter, not a link — with that consent and the withdrawal
 * information in it, before the work begins: without it the right does not lapse at all
 * (§ 356 Abs. 6 BGB). Both are kept here so that the page and the letter say the same words.
 *
 * The withdrawal texts repeat the refund policy (apps/web/src/content/legal/refunds.ts) word for
 * word; a change there is a change here.
 */

export const SELLER_LINES = [
  'coremind s. r. o.',
  'Vlčie hrdlo 1887/81, 821 07 Bratislava – Ružinov',
  'IČO 57 339 368, IČ DPH SK2122681594',
  'help@chronika.me',
];

const COUNTRY: Record<string, string> = {
  ru: 'Словакия',
  uk: 'Словаччина',
  en: 'Slovakia',
  de: 'Slowakei',
  pl: 'Słowacja',
  fr: 'Slovaquie',
  es: 'Eslovaquia',
};

/** The seller, in one line, in the buyer's language. */
export const sellerLine = (locale: string): string => {
  const [name, street, id, mail] = SELLER_LINES;
  return `${name}, ${street}, ${COUNTRY[locale] ?? COUNTRY.en}, ${id}, ${mail}`;
};

const CONSENT_EN =
  'I expressly agree that the document is created before the withdrawal period ends, and I acknowledge that I lose my right of withdrawal once it is delivered.';

/** What the payment page asks the buyer to agree to. The German wording follows § 356 Abs. 6 BGB:
 * consent to start before the withdrawal period ends, and knowledge that the right lapses when
 * performance begins. */
const CONSENT: Record<string, string> = {
  uk: 'Документ створюється одразу після оплати; з його доставкою право на відмову припиняється.',
  ru: 'Документ создаётся сразу после оплаты; с его доставкой право на отказ прекращается.',
  en: CONSENT_EN,
  de: 'Ich stimme ausdrücklich zu, dass Sie vor Ablauf der Widerrufsfrist mit der Erstellung des Dokuments beginnen, und mir ist bekannt, dass ich durch diese Zustimmung mit Beginn der Vertragserfüllung mein Widerrufsrecht verliere.',
  // Art. 38 ust. 1 pkt 13 ustawy o prawach konsumenta.
  pl: 'Wyrażam zgodę na rozpoczęcie świadczenia przed upływem terminu do odstąpienia od umowy i przyjmuję do wiadomości, że po spełnieniu świadczenia utracę prawo odstąpienia od umowy.',
  // Art. L221-28 13° du Code de la consommation.
  fr: "J'accepte expressément que l'exécution commence avant la fin du délai de rétractation et je reconnais que je perdrai ainsi mon droit de rétractation.",
  // Art. 103 m) del texto refundido de la Ley General para la Defensa de los Consumidores y Usuarios.
  es: 'Doy mi consentimiento expreso para que la ejecución comience antes de que finalice el plazo de desistimiento y reconozco que, con ello, pierdo mi derecho de desistimiento.',
};

export const withdrawalConsent = (locale: string): string => CONSENT[locale] ?? CONSENT_EN;

const WITHDRAWAL_EN = [
  'By law you have 14 days to withdraw from a distance purchase. For digital content whose supply began at your express request, that right ends on delivery. By placing an order you agree that the document is created and delivered immediately and acknowledge that you lose the right of withdrawal once it is delivered. Withdrawal is possible before generation starts — but generation starts as soon as payment is made.',
];

/** The withdrawal information the confirmation carries. German is the statutory model text
 * (Anlage 1 zu Art. 246a § 1 EGBGB) with the model form; the other languages repeat the refund
 * policy's own section. */
const WITHDRAWAL: Record<string, string[]> = {
  ru: [
    'По закону у вас есть 14 дней на отказ от дистанционной покупки. Для цифрового контента, поставка которого началась по вашему явному запросу, это право прекращается с момента доставки. Оформляя заказ, вы соглашаетесь с тем, что документ будет создан и доставлен сразу, и подтверждаете, что понимаете утрату права на отказ после доставки. До начала генерации отказ возможен — но генерация начинается сразу после оплаты.',
  ],
  uk: [
    'За законом у вас є 14 днів на відмову від дистанційної покупки. Для цифрового контенту, постачання якого почалося за вашим явним запитом, це право припиняється з моменту доставки. Оформлюючи замовлення, ви погоджуєтеся з тим, що документ буде створено і доставлено одразу, і підтверджуєте, що розумієте втрату права на відмову після доставки. До початку генерації відмова можлива — але генерація починається одразу після оплати.',
  ],
  en: WITHDRAWAL_EN,
  de: [
    'Widerrufsrecht',
    'Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen. Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag des Vertragsabschlusses.',
    'Um Ihr Widerrufsrecht auszuüben, müssen Sie uns (coremind s. r. o., Vlčie hrdlo 1887/81, 821 07 Bratislava – Ružinov, Slowakei, E-Mail: help@chronika.me) mittels einer eindeutigen Erklärung (z. B. ein mit der Post versandter Brief oder eine E-Mail) über Ihren Entschluss, diesen Vertrag zu widerrufen, informieren. Sie können dafür das beigefügte Muster-Widerrufsformular verwenden, das jedoch nicht vorgeschrieben ist. Sie können den Widerruf auch über die Schaltfläche „Vertrag widerrufen“ auf unserer Website erklären.',
    'Zur Wahrung der Widerrufsfrist reicht es aus, dass Sie die Mitteilung über die Ausübung des Widerrufsrechts vor Ablauf der Widerrufsfrist absenden.',
    'Folgen des Widerrufs',
    'Wenn Sie diesen Vertrag widerrufen, haben wir Ihnen alle Zahlungen, die wir von Ihnen erhalten haben, unverzüglich und spätestens binnen vierzehn Tagen ab dem Tag zurückzuzahlen, an dem die Mitteilung über Ihren Widerruf dieses Vertrags bei uns eingegangen ist. Für diese Rückzahlung verwenden wir dasselbe Zahlungsmittel, das Sie bei der ursprünglichen Transaktion eingesetzt haben, es sei denn, mit Ihnen wurde ausdrücklich etwas anderes vereinbart; in keinem Fall werden Ihnen wegen dieser Rückzahlung Entgelte berechnet.',
    'Erlöschen des Widerrufsrechts',
    'Ihr Widerrufsrecht erlischt, wenn wir mit der Vertragserfüllung begonnen haben, nachdem Sie ausdrücklich zugestimmt haben, dass wir vor Ablauf der Widerrufsfrist mit der Vertragserfüllung beginnen, und Ihre Kenntnis davon bestätigt haben, dass durch diese Zustimmung mit Beginn der Vertragserfüllung Ihr Widerrufsrecht erlischt (§ 356 Abs. 6 BGB). Diese E-Mail ist die Bestätigung des Vertrags, die das Gesetz dafür vorsieht.',
    'Muster-Widerrufsformular',
    '(Wenn Sie den Vertrag widerrufen wollen, dann füllen Sie bitte dieses Formular aus und senden Sie es zurück.)',
    'An coremind s. r. o., Vlčie hrdlo 1887/81, 821 07 Bratislava – Ružinov, Slowakei, E-Mail: help@chronika.me: Hiermit widerrufe(n) ich/wir (*) den von mir/uns (*) abgeschlossenen Vertrag über den Kauf der folgenden Waren (*)/die Erbringung der folgenden Dienstleistung (*) — Bestellt am (*)/erhalten am (*) — Name des/der Verbraucher(s) — Anschrift des/der Verbraucher(s) — Unterschrift des/der Verbraucher(s) (nur bei Mitteilung auf Papier) — Datum',
    '(*) Unzutreffendes streichen.',
  ],
  // The statutory model (załącznik nr 1 do ustawy o prawach konsumenta) and its form, as the
  // refund page has them word for word.
  pl: [
    "Prawo odstąpienia od umowy",
    "Mają Państwo prawo odstąpić od niniejszej umowy w terminie 14 dni bez podania jakiejkolwiek przyczyny.",
    "Termin do odstąpienia od umowy wygasa po upływie 14 dni od dnia zawarcia umowy.",
    "Aby skorzystać z prawa odstąpienia od umowy, muszą Państwo poinformować nas (coremind s. r. o., Vlčie hrdlo 1887/81, 821 07 Bratysława – Ružinov, Słowacja, e-mail: help@chronika.me) o swojej decyzji o odstąpieniu od niniejszej umowy w drodze jednoznacznego oświadczenia (na przykład pismo wysłane pocztą lub pocztą elektroniczną). Mogą Państwo skorzystać z wzoru formularza odstąpienia od umowy, jednak nie jest to obowiązkowe. Mogą Państwo również wypełnić i przesłać formularz odstąpienia od umowy lub jakiekolwiek inne jednoznaczne oświadczenie drogą elektroniczną na naszej stronie internetowej, za pomocą przycisku „Odstąpienie od umowy”. Jeżeli skorzystają Państwo z tej możliwości, prześlemy Państwu niezwłocznie potwierdzenie otrzymania informacji o odstąpieniu od umowy na trwałym nośniku (np. pocztą elektroniczną).",
    "Aby zachować termin do odstąpienia od umowy, wystarczy, aby wysłali Państwo informację dotyczącą wykonania przysługującego Państwu prawa odstąpienia od umowy przed upływem terminu do odstąpienia od umowy. Najprościej odstąpić od umowy, pisząc na adres help@chronika.me.",
    "Skutki odstąpienia od umowy",
    "W przypadku odstąpienia od niniejszej umowy zwracamy Państwu wszystkie otrzymane od Państwa płatności, w tym koszty dostarczenia towaru (z wyjątkiem dodatkowych kosztów wynikających z wybranego przez Państwa sposobu dostarczenia innego niż najtańszy zwykły sposób dostarczenia oferowany przez nas), niezwłocznie, a w każdym przypadku nie później niż 14 dni od dnia, w którym zostaliśmy poinformowani o Państwa decyzji o wykonaniu prawa odstąpienia od niniejszej umowy. Zwrotu płatności dokonamy przy użyciu takich samych sposobów płatności, jakie zostały przez Państwa użyte w pierwotnej transakcji, chyba że wyraźnie zgodziliście się Państwo na inne rozwiązanie; w każdym przypadku nie poniosą Państwo żadnych opłat w związku z tym zwrotem.",
    "Utrata prawa odstąpienia od umowy",
    "Prawo odstąpienia od umowy nie przysługuje w odniesieniu do umowy o dostarczanie treści cyfrowych niedostarczanych na nośniku materialnym, za które konsument jest zobowiązany do zapłaty ceny (art. 38 ust. 1 pkt 13 ustawy z dnia 30 maja 2014 r. o prawach konsumenta, Dz. U. z 2026 r. poz. 1244), jeżeli:",
    "– rozpoczęliśmy świadczenie za Państwa wyraźną i uprzednią zgodą,",
    "– przed rozpoczęciem świadczenia zostali Państwo poinformowani, że po spełnieniu świadczenia przez nas utracą Państwo prawo odstąpienia od umowy, i przyjęli to Państwo do wiadomości, oraz",
    "– przekazaliśmy Państwu potwierdzenie, o którym mowa w art. 15 ust. 1 i 2 albo art. 21 ust. 1 tej ustawy; przy umowie zawartej na odległość jest to potwierdzenie zawarcia umowy na trwałym nośniku, obejmujące informację o udzielonej przez Państwa zgodzie.",
    "Tę zgodę wyrażają Państwo i utratę prawa odstąpienia od umowy przyjmują Państwo do wiadomości na stronie zamówienia oraz ponownie na stronie płatności, zanim Państwo zapłacą, składając oświadczenie: „Wyrażam zgodę na rozpoczęcie świadczenia przed upływem terminu do odstąpienia od umowy i przyjmuję do wiadomości, że po spełnieniu świadczenia utracę prawo odstąpienia od umowy.” Przygotowanie dokumentu rozpoczyna się bezpośrednio po zapłacie.",
    "Wzór formularza odstąpienia od umowy",
    "(formularz ten należy wypełnić i odesłać tylko w przypadku chęci odstąpienia od umowy)",
    "– Adresat: coremind s. r. o., Vlčie hrdlo 1887/81, 821 07 Bratysława – Ružinov, Słowacja, e-mail: help@chronika.me",
    "– Ja/My(*) niniejszym informuję/informujemy(*) o moim/naszym odstąpieniu od umowy sprzedaży następujących towarów(*) umowy dostawy następujących towarów(*) umowy o dzieło polegającej na wykonaniu następujących towarów(*)/o świadczenie następującej usługi(*)",
    "– Data zawarcia umowy(*)/odbioru(*)",
    "– Imię i nazwisko konsumenta(-ów)",
    "– Adres konsumenta(-ów)",
    "– Podpis konsumenta(-ów) (tylko jeżeli formularz jest przesyłany w wersji papierowej)",
    "– Data",
    "(*) Niepotrzebne skreślić.",
    'Ta wiadomość jest potwierdzeniem zawarcia umowy, o którym mowa wyżej.',
  ],
  // The French and Spanish statutory models (annexe à l'article R. 221-1 du code de la
  // consommation; anexo B del texto refundido de la LGDCU) and their forms, as the refund page
  // has them word for word.
  fr: [
    "Droit de rétractation",
    "Vous avez le droit de vous rétracter du présent contrat sans donner de motif dans un délai de quatorze jours.",
    "Le délai de rétractation expire quatorze jours après le jour de la conclusion du contrat.",
    "Pour exercer le droit de rétractation, vous devez nous notifier (coremind s. r. o., Vlčie hrdlo 1887/81, 821 07 Bratislava – Ružinov, Slovaquie, courriel : help@chronika.me) votre décision de rétractation du présent contrat au moyen d'une déclaration dénuée d'ambiguïté (par exemple, lettre envoyée par la poste ou courrier électronique). Vous pouvez utiliser le modèle de formulaire de rétractation mais ce n'est pas obligatoire. Vous pouvez également exercer votre droit de rétractation en ligne sur notre site internet, au moyen du bouton « Se rétracter du contrat ici ». Si vous utilisez cette fonctionnalité en ligne, nous vous enverrons, dans les meilleurs délais, un accusé de réception de la rétractation sur un support durable (par exemple, par courriel), y compris son contenu ainsi que la date et l'heure de sa soumission.",
    "Pour que le délai de rétractation soit respecté, il suffit que vous transmettiez votre communication relative à l'exercice du droit de rétractation avant l'expiration du délai de rétractation. Le plus simple est de vous rétracter par courriel à help@chronika.me.",
    "Effets de rétractation",
    "En cas de rétractation de votre part du présent contrat, nous vous rembourserons tous les paiements reçus de vous, y compris les frais de livraison (à l'exception des frais supplémentaires découlant du fait que vous avez choisi, le cas échéant, un mode de livraison autre que le mode moins coûteux de livraison standard proposé par nous) sans retard excessif et, en tout état de cause, au plus tard quatorze jours à compter du jour où nous sommes informés de votre décision de rétractation du présent contrat. Nous procéderons au remboursement en utilisant le même moyen de paiement que celui que vous aurez utilisé pour la transaction initiale, sauf si vous convenez expressément d'un moyen différent ; en tout état de cause, ce remboursement n'occasionnera pas de frais pour vous.",
    "Exception au droit de rétractation",
    "Le droit de rétractation ne peut être exercé pour un contrat de fourniture d'un contenu numérique sans support matériel dont l'exécution a commencé avant la fin du délai de rétractation et qui vous soumet à une obligation de payer (article L. 221-28, 13°, du code de la consommation), lorsque :",
    "– vous avez donné préalablement votre consentement exprès pour que l'exécution du contrat commence avant l'expiration du délai de rétractation,",
    "– vous avez reconnu que vous perdrez votre droit de rétractation, et",
    "– nous vous avons fourni la confirmation de votre accord conformément au deuxième alinéa de l'article L. 221-13 du même code ; pour ce contrat conclu à distance, il s'agit de la confirmation du contrat sur un support durable, qui comprend la confirmation de votre accord exprès et de la reconnaissance de la perte de votre droit de rétractation.",
    "Vous donnez cet accord et reconnaissez la perte de votre droit de rétractation sur la page de commande, puis à nouveau sur la page de paiement, avant de payer, en acceptant la déclaration suivante : « J'accepte expressément que l'exécution commence avant la fin du délai de rétractation et je reconnais que je perdrai ainsi mon droit de rétractation. » La préparation du document commence immédiatement après le paiement.",
    "Modèle de formulaire de rétractation",
    "(Veuillez compléter et renvoyer le présent formulaire uniquement si vous souhaitez vous rétracter du contrat.)",
    "– À l'attention de coremind s. r. o., Vlčie hrdlo 1887/81, 821 07 Bratislava – Ružinov, Slovaquie, courriel : help@chronika.me :",
    "– Je/nous (*) vous notifie/notifions (*) par la présente ma/notre (*) rétractation du contrat portant sur la vente du bien (*)/pour la prestation de services (*) ci-dessous :",
    "– Commandé le (*)/reçu le (*) :",
    "– Nom du (des) consommateur(s) :",
    "– Adresse du (des) consommateur(s) :",
    "– Signature du (des) consommateur(s) (uniquement en cas de notification du présent formulaire sur papier) :",
    "– Date :",
    "(*) Rayez la mention inutile.",
    "Ce message est la confirmation du contrat mentionnée ci-dessus.",
  ],
  es: [
    "Derecho de desistimiento",
    "Tiene usted derecho a desistir del presente contrato en un plazo de catorce días naturales sin necesidad de justificación.",
    "El plazo de desistimiento expirará a los catorce días naturales del día de la celebración del contrato.",
    "Para ejercer el derecho de desistimiento, deberá usted notificarnos (coremind s. r. o., Vlčie hrdlo 1887/81, 821 07 Bratislava – Ružinov, Eslovaquia, correo electrónico: help@chronika.me) su decisión de desistir del contrato a través de una declaración inequívoca (por ejemplo, una carta enviada por correo postal o correo electrónico). Podrá utilizar el modelo de formulario de desistimiento que figura a continuación, aunque su uso no es obligatorio. Tiene usted asimismo la opción de cumplimentar y enviar electrónicamente el modelo de formulario de desistimiento o cualquier otra declaración inequívoca a través de nuestro sitio web, mediante el botón «Desistir del contrato». Si recurre a esa opción, le comunicaremos sin demora en un soporte duradero (por ejemplo, por correo electrónico) la recepción de dicho desistimiento.",
    "Para cumplir el plazo de desistimiento, basta con que la comunicación relativa al ejercicio por su parte de este derecho sea enviada antes de que venza el plazo correspondiente. La forma más sencilla de desistir es escribir a help@chronika.me.",
    "Consecuencias del desistimiento",
    "En caso de desistimiento por su parte, le devolveremos todos los pagos recibidos de usted, incluidos los gastos de entrega (con la excepción de los gastos adicionales resultantes de la elección por su parte de una modalidad de entrega diferente a la modalidad menos costosa de entrega ordinaria que ofrezcamos) sin ninguna demora indebida y, en todo caso, a más tardar 14 días naturales a partir de la fecha en la que se nos informe de su decisión de desistir del presente contrato. Procederemos a efectuar dicho reembolso utilizando el mismo medio de pago empleado por usted para la transacción inicial, a no ser que haya usted dispuesto expresamente lo contrario; en todo caso, no incurrirá en ningún gasto como consecuencia del reembolso.",
    "Pérdida del derecho de desistimiento",
    "Conforme al artículo 103, letra m), del texto refundido de la Ley General para la Defensa de los Consumidores y Usuarios y otras leyes complementarias, aprobado por el Real Decreto Legislativo 1/2007, de 16 de noviembre, el derecho de desistimiento no es aplicable al suministro de contenido digital que no se preste en un soporte material cuando la ejecución haya comenzado y, si el contrato impone al consumidor una obligación de pago, cuando:",
    "– usted haya otorgado su consentimiento previo y expreso para iniciar la ejecución durante el plazo del derecho de desistimiento,",
    "– haya expresado su conocimiento de que, en consecuencia, pierde su derecho de desistimiento, y",
    "– le hayamos proporcionado la confirmación prevista en el artículo 98.7 de dicha ley; en un contrato a distancia como este, es la confirmación del contrato en un soporte duradero, que incluye la confirmación de su consentimiento previo y expreso y de su conocimiento de la pérdida del derecho de desistimiento.",
    "Este consentimiento y este reconocimiento se prestan en la página del pedido y de nuevo en la página de pago, antes de pagar, mediante la declaración: «Doy mi consentimiento expreso para que la ejecución comience antes de que finalice el plazo de desistimiento y reconozco que, con ello, pierdo mi derecho de desistimiento.» La elaboración del documento comienza inmediatamente después del pago.",
    "Modelo de formulario de desistimiento",
    "(sólo debe cumplimentar y enviar el presente formulario si desea desistir del contrato)",
    "– A la atención de coremind s. r. o., Vlčie hrdlo 1887/81, 821 07 Bratislava – Ružinov, Eslovaquia, correo electrónico: help@chronika.me:",
    "– Por la presente le comunico/comunicamos (*) que desisto de mi/desistimos de nuestro (*) contrato de venta del siguiente bien/prestación del siguiente servicio (*)",
    "– Pedido el/recibido el (*)",
    "– Nombre del consumidor y usuario o de los consumidores y usuarios",
    "– Domicilio del consumidor y usuario o de los consumidores y usuarios",
    "– Firma del consumidor y usuario o de los consumidores y usuarios (solo si el presente formulario se presenta en papel)",
    "– Fecha",
    "(*) Táchese lo que no proceda.",
    "Este correo es la confirmación del contrato mencionada más arriba.",
  ],
};

export const withdrawalInfo = (locale: string): string[] => WITHDRAWAL[locale] ?? WITHDRAWAL_EN;

/** The short lines of the statutory texts that are headings rather than paragraphs. */
export const WITHDRAWAL_HEADINGS = new Set([
  'Widerrufsrecht',
  'Folgen des Widerrufs',
  'Erlöschen des Widerrufsrechts',
  'Muster-Widerrufsformular',
  'Prawo odstąpienia od umowy',
  'Skutki odstąpienia od umowy',
  'Utrata prawa odstąpienia od umowy',
  'Wzór formularza odstąpienia od umowy',
  // French and Spanish.
  "Droit de rétractation",
  "Effets de rétractation",
  "Exception au droit de rétractation",
  "Modèle de formulaire de rétractation",
  "Derecho de desistimiento",
  "Consecuencias del desistimiento",
  "Pérdida del derecho de desistimiento",
  "Modelo de formulario de desistimiento",
]);
