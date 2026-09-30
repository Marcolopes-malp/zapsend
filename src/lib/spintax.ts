// Spintax: "{Olá|Oi|Opa}, {tudo bem|como vai}?" -> escolhe uma opção aleatória de cada grupo.
// Suporta grupos aninhados: "{Oi|Olá{!|, tudo bem?}}".
// Variáveis dinâmicas: {saudacao} -> Bom dia / Boa tarde / Boa noite (conforme o horário).

const INNERMOST_GROUP = /\{([^{}]*)\}/;

function saudacao(date: Date): string {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'Bom dia';
  if (hour >= 12 && hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

export function spin(template: string, date: Date = new Date()): string {
  let text = template.replace(/\{saudacao\}/gi, saudacao(date));

  // Resolve sempre o grupo mais interno primeiro, até não sobrar nenhum
  let match = text.match(INNERMOST_GROUP);
  while (match) {
    const options = match[1].split('|');
    const choice = options[Math.floor(Math.random() * options.length)];
    text = text.slice(0, match.index) + choice + text.slice(match.index! + match[0].length);
    match = text.match(INNERMOST_GROUP);
  }

  return text;
}

export function randomBetween(min: number, max: number): number {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return lo + Math.random() * (hi - lo);
}
