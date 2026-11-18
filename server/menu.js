// Categories and the starting menu. Prices come from the printed menu; cool drinks
// and cookies are placeholders the owner edits in Settings.
const CATS = [
  { id: 'tea', name: 'Tea & Coffee', te: 'టీ & కాఫీ' },
  { id: 'snacks', name: 'Snacks', te: 'స్నాక్స్' },
  { id: 'drinks', name: 'Cool Drinks', te: 'కూల్ డ్రింక్స్' },
  { id: 'cookies', name: 'Cookies', te: 'కుకీస్' },
  { id: 'cig', name: 'Cigarettes', te: 'సిగరెట్లు', staffOnly: true },
];

const DEFAULT_ITEMS = [
  ['tea', 'Tea', 'టీ', 'tea', 10],
  ['ginger', 'Ginger Tea', 'అల్లం టీ', 'tea', 20],
  ['masala', 'Masala Tea', 'మసాలా టీ', 'tea', 20],
  ['blacktea', 'Black Tea', 'బ్లాక్ టీ', 'tea', 20],
  ['blackcoffee', 'Black Coffee', 'బ్లాక్ కాఫీ', 'tea', 20],
  ['coffee', 'Coffee', 'కాఫీ', 'tea', 20],
  ['lemon', 'Lemon Tea', 'లెమన్ టీ', 'tea', 20],
  ['green', 'Green Tea', 'గ్రీన్ టీ', 'tea', 25],
  ['boost', 'Boost', 'బూస్ట్', 'tea', 20],
  ['milk', 'Milk', 'పాలు', 'tea', 20],
  ['samosa', 'Samosa Plate', 'సమోసా ప్లేట్', 'snacks', 30],
  ['rusk', 'Rusk', 'రస్క్', 'snacks', 20],
  ['biscuits', 'Biscuits', 'బిస్కెట్లు', 'snacks', 20],
  ['bun', 'Bun', 'బన్', 'snacks', 10],
  ['cd-small', 'Cool Drink (Small)', 'కూల్ డ్రింక్ (చిన్నది)', 'drinks', 20],
  ['cd-big', 'Cool Drink (Big)', 'కూల్ డ్రింక్ (పెద్దది)', 'drinks', 40],
  ['water', 'Water Bottle', 'వాటర్ బాటిల్', 'drinks', 10],
  ['cookie', 'Cookies', 'కుకీస్', 'cookies', 10],
  ['cig10', 'Cigarette ₹10', '', 'cig', 10],
  ['cig15', 'Cigarette ₹15', '', 'cig', 15],
  ['cig20', 'Cigarette ₹20', '', 'cig', 20],
  ['cig25', 'Cigarette ₹25', '', 'cig', 25],
].map(([id, name, te, cat, price], sort) => ({ _id: id, name, te, cat, price, qr: cat !== 'cig', sort }));

module.exports = { CATS, DEFAULT_ITEMS };
