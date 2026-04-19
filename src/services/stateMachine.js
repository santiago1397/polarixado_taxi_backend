export const STATES = {
  PENDING_PAYMENT: "PENDING_PAYMENT",
  CONFIRMED: "CONFIRMED",
  EN_ROUTE: "EN_ROUTE",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
};

const transitions = {
  PENDING_PAYMENT: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["EN_ROUTE", "CANCELLED"],
  EN_ROUTE: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransition(from, to) {
  return (transitions[from] || []).includes(to);
}
