import { MapPin, Phone, User } from 'lucide-react';
import { useRef } from 'react';

import { TextField } from '@/ui';

/** Phone / name / address inputs of the customer form (manage-customers.html); Enter moves on and finally submits. */
export function CustomerFormFields({ draft, errors, change, onSubmit }) {
  const nameRef = useRef(null);
  const addressRef = useRef(null);
  const next = (ref) => (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      ref.current?.focus();
    }
  };

  return (
    <div className="space-y-4">
      <TextField
        label="Phone Number *"
        placeholder="98765 43210"
        type="tel"
        inputMode="tel"
        autoComplete="off"
        leftIcon={Phone}
        value={draft.phone}
        error={errors.phone}
        onChange={change('phone')}
        onKeyDown={next(nameRef)}
      />
      <TextField
        ref={nameRef}
        label="Customer Name *"
        placeholder="e.g. ABC Traders"
        autoComplete="off"
        leftIcon={User}
        value={draft.name}
        error={errors.name}
        onChange={change('name')}
        onKeyDown={next(addressRef)}
      />
      <TextField
        ref={addressRef}
        label="Address"
        placeholder="Street, area, city"
        autoComplete="off"
        leftIcon={MapPin}
        value={draft.address}
        onChange={change('address')}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onSubmit();
          }
        }}
      />
    </div>
  );
}
