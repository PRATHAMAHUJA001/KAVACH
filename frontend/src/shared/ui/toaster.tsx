import { Toaster as SonnerToaster } from "sonner";

export { toast } from "sonner";

export function Toaster({ theme }: { theme: "light" | "dark" }) {
  return (
    <SonnerToaster
      theme={theme}
      position="bottom-right"
      closeButton
      toastOptions={{
        classNames: {
          toast:
            "!rounded-xl !border !border-border !bg-surface !text-fg !shadow-overlay !font-sans !text-body !gap-3",
          description: "!text-muted",
          actionButton: "!bg-brand !text-brand-fg !rounded-lg",
        },
      }}
    />
  );
}
