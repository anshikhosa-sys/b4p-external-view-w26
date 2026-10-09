import { useEffect, useRef } from 'react';
import { canRequest } from '../inventory';
import QuantityStepper from './QuantityStepper';

// "Add" until the item is in the request, then a stepper. When the stepper
// goes back to 0 while focused, focus moves to the Add button that replaces it.
export default function RequestControl({ item, quantity, onChange, compact, short = compact }) {
  const addRef = useRef(null);
  const stepperFocused = useRef(false);

  useEffect(() => {
    if (!quantity && stepperFocused.current && addRef.current) {
      stepperFocused.current = false;
      addRef.current.focus();
    }
  }, [quantity]);

  if (!canRequest(item)) {
    return (
      <p className="request-control__blocked">
        {item.expiryState === 'expired' ? 'Expired, can’t be requested' : 'Out of stock'}
      </p>
    );
  }
  if (!quantity) {
    return (
      <button
        ref={addRef}
        type="button"
        className="btn btn--secondary btn--add"
        onClick={() => onChange(1)}
        aria-label={`Add ${item.name} to request`}
      >
        {short ? 'Add' : 'Add to request'}
      </button>
    );
  }
  return (
    <div
      className="request-control"
      onFocus={() => { stepperFocused.current = true; }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) stepperFocused.current = false;
      }}
    >
      <QuantityStepper
        value={quantity}
        max={item.quantity}
        onChange={onChange}
        itemName={item.name}
        compact={compact}
      />
    </div>
  );
}
