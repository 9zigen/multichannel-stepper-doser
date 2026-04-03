import { useEffect } from 'react';
import { UseFormWatch, UseFormHandleSubmit, FieldValues, SubmitHandler, Path } from 'react-hook-form';

interface UseAutoSubmitOptions<T extends FieldValues> {
  watch: UseFormWatch<T>;
  handleSubmit: UseFormHandleSubmit<T>;
  onSubmit: SubmitHandler<T>;
  fields?: Path<T>[];
  debounce?: number;
  enabled?: boolean;
}

export function useAutoSubmit<T extends FieldValues>({
  watch,
  handleSubmit,
  onSubmit,
  fields,
  debounce = 1000,
  enabled = true,
}: UseAutoSubmitOptions<T>) {
  const watchedFields = fields ? watch(fields) : watch();
  useEffect(() => {
    if (!enabled) return;

    const timeoutId = setTimeout(() => {
      handleSubmit(onSubmit)();
    }, debounce);

    return () => clearTimeout(timeoutId);
  }, [watchedFields, handleSubmit, onSubmit, debounce, enabled]);

  return {
    isAutoSubmitEnabled: enabled,
    autoSubmitDelay: debounce,
  };
}
