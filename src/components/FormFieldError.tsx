type FormFieldErrorProps = {
  message?: string;
};

export default function FormFieldError({ message }: FormFieldErrorProps) {
  if (!message) return null;
  return <div className="field-error">{message}</div>;
}
