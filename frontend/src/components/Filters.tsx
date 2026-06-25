'use client';

import { Input, Select } from './ui/select';

interface FiltersProps {
  date: string;
  category: string;
  categories: string[];
  onDateChange: (date: string) => void;
  onCategoryChange: (category: string) => void;
}

export function Filters({
  date,
  category,
  categories,
  onDateChange,
  onCategoryChange,
}: FiltersProps) {
  return (
    <div className="flex flex-wrap items-end gap-4">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">Data</span>
        <Input type="date" value={date} onChange={(e) => onDateChange(e.target.value)} />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">Categoria</span>
        <Select value={category} onChange={(e) => onCategoryChange(e.target.value)}>
          <option value="">Todas</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </label>
    </div>
  );
}
