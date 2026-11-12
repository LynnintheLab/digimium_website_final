import { discountPriceError } from '@/lib/pricing';
import './price-field.css';

type PriceFieldProps = {
  id: string;
  discountId: string;
  price: string;
  discountPrice?: string;
  onChange: (patch: { price?: string; discountPrice?: string }) => void;
  showEnquiryHint?: boolean;
};

export default function PriceField({ id, discountId, price, discountPrice, onChange, showEnquiryHint }: PriceFieldProps) {
  const error = discountPriceError(price, discountPrice);
  return (
    <div className="admin-price-fields">
      <div className="admin-field">
        <label htmlFor={id}>Regular price <span className="admin-optional">Optional</span></label>
        <input id={id} value={price} maxLength={80} placeholder="e.g. 25,000 MMK"
          aria-invalid={error?.field === 'price' || undefined}
          aria-describedby={error?.field === 'price' ? discountId + '-hint' : showEnquiryHint ? id + '-hint' : undefined}
          onChange={event => onChange({ price: event.target.value })} />
        {showEnquiryHint && <small id={id + '-hint'}>Leave blank for customers to ask.</small>}
      </div>
      <div className="admin-field">
        <label htmlFor={discountId}>Discount price <span className="admin-optional">Optional</span></label>
        <input id={discountId} value={discountPrice ?? ''} maxLength={80} placeholder="e.g. 20,000 MMK"
          aria-invalid={error?.field === 'discountPrice' || undefined} aria-describedby={discountId + '-hint'}
          onChange={event => onChange({ discountPrice: event.target.value || undefined })} />
        <small id={discountId + '-hint'} className={error ? 'admin-price-error' : undefined}>
          {error?.message || 'The amount the customer pays during the sale, in MMK.'}
        </small>
      </div>
    </div>
  );
}
