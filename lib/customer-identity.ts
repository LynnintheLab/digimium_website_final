import type { CommerceCustomer } from './commerce-types';

/** A usable customer identifier without fabricating an email for Telegram accounts. */
export function customerContact(customer: Pick<CommerceCustomer, 'email' | 'telegram'>): string {
  if (customer.email) return customer.email;
  if (!customer.telegram) return '';
  return ['Telegram', customer.telegram.username ? '@' + customer.telegram.username : '', 'ID ' + customer.telegram.id].filter(Boolean).join(' · ');
}
