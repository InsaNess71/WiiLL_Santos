export const BAD_WORDS = [
  'porra', 'caralho', 'buceta', 'puta', 'viado', 'arrombado', 'fuder', 'fode',
  'cu', 'merda', 'bosta', 'cacete', 'piroca', 'pica', 'rola', 'xoxota', 'corno',
  'puto', 'vadia', 'rapariga', 'prostituta', 'macaco', 'preto', 'crioulo', 'viadinho',
  'sapatão', 'boiola', 'bicha', 'retardado', 'mongol', 'estupro', 'pedofilia', 'suicidio',
  'matar', 'morte', 'assassinato'
];

export function containsProfanity(text: string): boolean {
  const normalizedText = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return BAD_WORDS.some(word => {
    const regex = new RegExp(`\\b${word}\\b`, 'i');
    return regex.test(normalizedText);
  });
}

export function filterProfanity(text: string): string {
  let filteredText = text;
  const normalizedText = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  
  BAD_WORDS.forEach(word => {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    filteredText = filteredText.replace(regex, '***');
  });
  
  return filteredText;
}
