// Lightweight, rule-based category suggestion from an expense title.
// This is a helpful nudge, NOT a machine-learning model — pure keyword
// matching against small, conservative lists. Returns null when nothing
// matches so the UI never forces a guess on the user.

const KEYWORDS = {
  'Food & Dining': [
    'zomato', 'swiggy', 'restaurant', 'cafe', 'coffee', 'lunch', 'dinner',
    'breakfast', 'food', 'grocery', 'groceries', 'dominos', 'starbucks',
    'mcdonald', 'pizza', 'burger', 'bakery', 'snack', 'dhaba',
  ],
  Transportation: [
    'uber', 'ola', 'taxi', 'fuel', 'petrol', 'diesel', 'metro', 'bus',
    'train', 'parking', 'cab', 'rapido', 'toll', 'auto rickshaw', 'auto',
  ],
  Shopping: [
    'amazon', 'flipkart', 'myntra', 'mall', 'store', 'ajio', 'shopping',
    'clothes', 'clothing', 'shoes', 'electronics',
  ],
  Entertainment: [
    'netflix', 'spotify', 'movie', 'cinema', 'prime video', 'hotstar',
    'concert', 'game', 'gaming', 'pvr', 'inox', 'youtube premium',
  ],
  Healthcare: [
    'pharmacy', 'hospital', 'doctor', 'medicine', 'clinic', 'medical',
    'dentist', 'diagnostic', 'lab test', 'health insurance',
  ],
  Education: [
    'course', 'book', 'tuition', 'school', 'college', 'udemy', 'coursera',
    'exam fee', 'stationery', 'textbook',
  ],
  Utilities: [
    'electricity', 'water bill', 'gas bill', 'internet', 'wifi',
    'broadband', 'recharge', 'mobile bill', 'dth', 'phone bill',
  ],
  Housing: [
    'rent', 'maintenance', 'house rent', 'apartment rent', 'society fee',
  ],
  Travel: [
    'flight', 'hotel', 'airbnb', 'booking.com', 'train ticket', 'irctc',
    'vacation', 'trip', 'makemytrip', 'goibibo',
  ],
  'Personal Care': [
    'salon', 'spa', 'haircut', 'gym', 'parlour', 'skincare', 'cosmetics',
  ],
};

/**
 * Suggests a category for an expense based on keyword matches in its title.
 * @param {string} title
 * @returns {string|null} A category name, or null if no keyword matched.
 */
const suggestCategory = (title) => {
  if (!title || typeof title !== 'string') return null;
  const lower = title.toLowerCase();

  for (const [category, keywords] of Object.entries(KEYWORDS)) {
    if (keywords.some((keyword) => lower.includes(keyword))) {
      return category;
    }
  }
  return null;
};

module.exports = { suggestCategory, KEYWORDS };
