import type { Language } from './domain/language.js'

// Russian for the server-rendered sign-in pages and Kept's emails (VISION.md §4.C). Keys are the English text.

const RU: Record<string, string> = {
  'Sign in': 'Вход',
  'Sign in to Kept': 'Вход в Kept',
  '{client} wants to use Kept as you. Enter the email you use with Kept, or the one you were invited with.': '{client} хочет пользоваться Kept от вашего имени. Введите email, с которым вы пользуетесь Kept, или тот, на который пришло приглашение.',
  "Review and fix what your assistant logged. Enter your email, or the one you were invited with, and we'll send you a code.": 'Проверяйте и исправляйте то, что записал ассистент. Введите свой email или тот, на который пришло приглашение, и мы пришлём код.',
  Email: 'Email',
  'Email me a code': 'Прислать код',
  Cancel: 'Отмена',
  'Enter a valid email.': 'Введите правильный email.',
  "We couldn't send the code just now. Try again in a minute.": 'Не удалось отправить код. Попробуйте через минуту.',
  'Enter your code': 'Введите код',
  'Check your email': 'Проверьте почту',
  'We sent a 6-digit code to {email}. It works for 10 minutes.': 'Мы отправили 6-значный код на {email}. Он действует 10 минут.',
  Code: 'Код',
  'Send a new code': 'Отправить новый код',
  'That code is wrong or expired. Check it, or send a new one.': 'Код неверный или устарел. Проверьте его или запросите новый.',
  'your email': 'вашу почту',
  'Join your household': 'Присоединиться к семье',
  'Join {household}': 'Присоединиться к «{household}»',
  '{inviter} invited you. Your purchases stay yours; the household shares categories, people & things, and totals.': '{inviter} приглашает вас. Ваши покупки остаются вашими; семья делит категории, людей и вещи и общие суммы.',
  'Your name': 'Ваше имя',
  'Enter your name.': 'Введите имя.',
  Join: 'Присоединиться',
  'Create your household': 'Создайте свою семью',
  "{email} isn't in a household yet. Joining someone else's? Ask them to invite this email, then sign in again.": '{email} пока не состоит в семье. Хотите присоединиться к чужой? Попросите пригласить этот email и войдите снова.',
  'Household name': 'Название семьи',
  'The Smiths': 'Ивановы',
  Currency: 'Валюта',
  'Time zone': 'Часовой пояс',
  'Currency can change until the first purchase.': 'Валюту можно изменить до первой покупки.',
  'Create household': 'Создать семью',
  "Enter the household's name and yours.": 'Введите название семьи и своё имя.',
  'Check the currency and time zone, then try again.': 'Проверьте валюту и часовой пояс и попробуйте снова.',
  'Allow access': 'Разрешить доступ',
  'Allow {client}?': 'Разрешить {client}?',
  "{client} will be able to log and edit your purchases, read your spending and household totals, change the household's categories, and keep your notes and watched groups, as you.": '{client} сможет от вашего имени записывать и менять ваши покупки, видеть ваши траты и общие суммы семьи, менять категории семьи и вести ваши заметки и списки слежения.',
  Allow: 'Разрешить',
  'Something went wrong': 'Что-то пошло не так',
  'This sign-in has expired.': 'Срок этого входа истёк.',
  'Go back to your assistant and connect Kept again.': 'Вернитесь к ассистенту и подключите Kept снова.',
  Language: 'Язык',
  // Emails
  'Kept sign-in code: {code}': 'Код для входа в Kept: {code}',
  "Type it on the sign-in page. It works for 10 minutes. If you didn't try to sign in, ignore this email.": 'Введите его на странице входа. Он действует 10 минут. Если вы не входили, просто проигнорируйте это письмо.',
  '{inviter} invited you to {household} on Kept': '{inviter} приглашает вас в «{household}» в Kept',
  '{inviter} invited you to track spending with {household} on Kept.': '{inviter} приглашает вас вести траты вместе с «{household}» в Kept.',
  'Add this address to your AI assistant (Claude, ChatGPT or Gemini) as a custom connector, and sign in with this email:': 'Добавьте этот адрес в своего ИИ-ассистента (Claude, ChatGPT или Gemini) как свой коннектор и войдите с этим email:',
  'Or sign in on the web: {app}': 'Или войдите в браузере: {app}',
  'sign in on the web': 'войдите в браузере',
  'Or {link}.': 'Или {link}.',
  'Your purchases stay yours; the household shares categories, people & things, and totals.': 'Ваши покупки остаются вашими; семья делит категории, людей и вещи и общие суммы.',
}

export function tr(lang: Language, text: string, vars?: Record<string, string>): string {
  const base = lang === 'ru' ? (RU[text] ?? text) : text
  return vars ? base.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? `{${k}}`) : base
}
