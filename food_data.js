// Este banco de dados é baseado na Tabela TACO (Tabela Brasileira de Composição de Alimentos - NEPA/UNICAMP)
// Valores por 100g de porção comestível, a menos que indicado (unidade, colher, etc).

export const foodDatabase = {
  // Cereais e Derivados
  'arroz_branco_cozido': { name: 'Arroz Branco Cozido', protein: 2.5, carbs: 28.1, fat: 0.2, cals: 128, unit: '100g', visceralFat: false },
  'arroz_integral_cozido': { name: 'Arroz Integral Cozido', protein: 2.6, carbs: 25.8, fat: 1.0, cals: 124, unit: '100g', visceralFat: false },
  'macarrao_cozido': { name: 'Macarrão Cozido', protein: 4.0, carbs: 26.6, fat: 0.6, cals: 131, unit: '100g', visceralFat: false },
  'pao_frances': { name: 'Pão Francês', protein: 8.0, carbs: 55.4, fat: 1.3, cals: 288, unit: '50g (unid)', visceralFat: false },
  'aveia_flocos': { name: 'Aveia em Flocos', protein: 13.9, carbs: 66.3, fat: 6.8, cals: 394, unit: '100g', visceralFat: false },
  
  // Ovos e Derivados
  'ovo_cozido': { name: 'Ovo de Galinha Cozido', protein: 13.3, carbs: 1.0, fat: 10.6, cals: 158, unit: '100g', visceralFat: false },
  'ovo_frito': { name: 'Ovo de Galinha Frito', protein: 12.8, carbs: 0.9, fat: 14.3, cals: 191, unit: '100g', visceralFat: true },
  
  // Carnes, Aves e Pescados
  'peito_frango_grelhado': { name: 'Peito de Frango Grelhado', protein: 32.8, carbs: 0, fat: 2.1, cals: 159, unit: '100g', visceralFat: false },
  'tilapia_grelhada': { name: 'Tilápia Grelhada', protein: 26.2, carbs: 0, fat: 3.4, cals: 139, unit: '100g', visceralFat: false },
  'salmao_cozido': { name: 'Salmão Cozido', protein: 23.4, carbs: 0, fat: 12.2, cals: 206, unit: '100g', visceralFat: false },
  'carne_bovina_patinho': { name: 'Carne Bovina (Patinho)', protein: 33.7, carbs: 0, fat: 4.8, cals: 181, unit: '100g', visceralFat: false },

  // Frutas e Vegetais
  'banana': { name: 'Banana Prata', protein: 1.3, carbs: 26.0, fat: 0.1, cals: 105, unit: 'unidade', visceralFat: false },
  'maca': { name: 'Maçã', protein: 0.3, carbs: 13.9, fat: 0.2, cals: 59, unit: 'unidade', visceralFat: false },
  'batata_doce_cozida': { name: 'Batata Doce Cozida', protein: 0.7, carbs: 20.1, fat: 0.1, cals: 83, unit: '100g', visceralFat: false },
  'brocolis_cozido': { name: 'Brócolis Cozido', protein: 2.3, carbs: 4.0, fat: 0.4, cals: 36, unit: '100g', visceralFat: false },
  
  // Laticínios e Outros
  'leite_integral': { name: 'Leite Integral', protein: 3.3, carbs: 4.7, fat: 3.5, cals: 61, unit: '100ml', visceralFat: true },
  'iogurte_natural': { name: 'Iogurte Natural', protein: 4.1, carbs: 7.3, fat: 3.0, cals: 72, unit: '100g', visceralFat: false },
  'pasta_amendoim_integral': { name: 'Pasta de Amendoim', protein: 25.8, carbs: 19.5, fat: 51.3, cals: 622, unit: '15g (colher)', visceralFat: false },
  
  // Junk food (para fins de exemplo)
  'batata_frita': { name: 'Batata Frita', protein: 3.5, carbs: 34.0, fat: 16.0, cals: 297, unit: '100g', visceralFat: true },
};
