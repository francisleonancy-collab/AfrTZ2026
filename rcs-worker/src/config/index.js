export const PLANS = {
  Starter: { limit: 30,  price: 300, label: '30 writing tasks',  isPaid: true  },
  Growth:  { limit: 100, price: 600, label: '100 writing tasks', isPaid: true  },
  Premium: { limit: -1,  price: 900, label: 'Unlimited',         isPaid: true  },
  Promo:   { limit: 3,   price: 0,   label: '3 writing tasks',   isPaid: false },
  Admin:   { limit: -1,  price: 0,   label: 'Unlimited',         isPaid: true  },
};

export const CONSTANTS = {
  CHARS: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
};
