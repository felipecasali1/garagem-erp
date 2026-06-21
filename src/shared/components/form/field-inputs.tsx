import * as React from "react";
import { Input } from "@/shared/components/ui/input";
import type { PersonType } from "@/shared/types/domain";
import {
  formatCep,
  formatDocument,
  formatNumberInput,
  formatPhone,
  formatPlate,
  normalizeCep,
  normalizeDocument,
  normalizePhone,
  normalizePlate,
  normalizeUf,
  parseNumberInput,
} from "@/shared/lib/field-format";

type CommonProps = Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type">;

export function CpfCnpjInput({
  value,
  onValueChange,
  personType,
  ...props
}: CommonProps & {
  value: string;
  onValueChange: (value: string) => void;
  personType: PersonType;
}) {
  return (
    <Input
      {...props}
      type="text"
      inputMode="numeric"
      value={formatDocument(value, personType)}
      onChange={(event) => onValueChange(normalizeDocument(event.target.value, personType))}
    />
  );
}

export function PhoneInput({
  value,
  onValueChange,
  ...props
}: CommonProps & {
  value: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <Input
      {...props}
      type="text"
      inputMode="numeric"
      value={formatPhone(value)}
      onChange={(event) => onValueChange(normalizePhone(event.target.value))}
    />
  );
}

export function CepInput({
  value,
  onValueChange,
  ...props
}: CommonProps & {
  value: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <Input
      {...props}
      type="text"
      inputMode="numeric"
      value={formatCep(value)}
      onChange={(event) => onValueChange(normalizeCep(event.target.value))}
    />
  );
}

export function PlateInput({
  value,
  onValueChange,
  ...props
}: CommonProps & {
  value: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <Input
      {...props}
      type="text"
      inputMode="text"
      value={formatPlate(value)}
      onChange={(event) => onValueChange(normalizePlate(event.target.value))}
    />
  );
}

export function UfInput({
  value,
  onValueChange,
  ...props
}: CommonProps & {
  value: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <Input
      {...props}
      type="text"
      inputMode="text"
      maxLength={2}
      value={value}
      onChange={(event) => onValueChange(normalizeUf(event.target.value))}
    />
  );
}

export function NumberInput({
  value,
  onValueChange,
  decimal,
  ...props
}: CommonProps & {
  value: number | null | undefined;
  onValueChange: (value: number | null) => void;
  decimal?: boolean;
}) {
  return (
    <Input
      {...props}
      type="number"
      inputMode={decimal ? "decimal" : "numeric"}
      step={decimal ? "0.01" : props.step}
      value={formatNumberInput(value)}
      onChange={(event) => onValueChange(parseNumberInput(event.target.value))}
    />
  );
}
