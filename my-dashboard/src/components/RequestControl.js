import { useEffect, useRef, useState } from 'react';
import { canRequest } from '../inventory';
import Icon from './Icons';
import QuantityStepper from './QuantityStepper';

// "Add to list" until the item is in the request, then a stepper. When the stepper
// goes back to 0 while focused, focus moves to the Add button that replaces it.
export default function RequestControl({ item, quantity, onChange, compact }) {
  const addRef = useRef(null);
  const stepperFocused = useRef(false);
  // "Added" shows next to the stepper for 3 seconds after Add (the toast region announces it too).
  const [justAdded, setJustAdded] = useState(false);
  useEffect(() => {
    if (!justAdded) return undefined;
    const t = setTimeout(() => setJustAdded(false), 3000);
    return () => clearTimeout(t);
  }, [justAdded]);

  useEffect(() => {
    if (!quantity && stepperFocused.current && addRef.current) {
      stepperFocused.current = false;
      addRef.current.focus();
    }
  }, [quantity]);

  if (!canRequest(item)) {
    return (
      <p className="request-control__blocked">
        {item.expiryState === 'expired' ? 'Expired, can’t be requested' : item.onHold ? 'On hold' : 'Out of stock'}
      </p>
    );
  }
  if (!quantity) {
    return (
      <button
        ref={addRef}
        type="button"
        className="btn btn--secondary btn--add"
        onClick={() => {
          onChange(1);
          setJustAdded(true);
        }}
        aria-label={`Add ${item.name} to request`}
      >
        Add to list
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
      {justAdded && (
        <span className="request-control__added" aria-hidden="true"><Icon name="check" size={16} /> Added</span>
      )}
    </div>
  );
}
