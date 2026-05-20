import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx"
import { Button } from "@/components/ui/button.tsx"

type ConfirmDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string
  variant?: "default" | "destructive"
  isPending?: boolean
  onConfirm: () => void
}

export const ConfirmDialog = ({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  variant = "destructive",
  isPending = false,
  onConfirm,
}: ConfirmDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button variant={variant} onClick={onConfirm} disabled={isPending}>
            {isPending ? "Processing…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
