import { Button } from "@/components/ui/button.tsx"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx"

type RoleChangeDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  userName: string
  currentRole: string
  targetRole: "USER" | "ADMIN"
  isPending: boolean
  onConfirm: () => void
}

export const RoleChangeDialog = ({
  open,
  onOpenChange,
  userName,
  currentRole,
  targetRole,
  isPending,
  onConfirm,
}: RoleChangeDialogProps) => {
  const isDemotion = currentRole === "ADMIN" && targetRole === "USER"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change role to {targetRole}?</DialogTitle>
          <DialogDescription>
            {userName} is currently {currentRole}.
            {isDemotion
              ? " They will lose admin access to the control plane."
              : " They will gain full admin access to the control plane."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            variant={isDemotion ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending ? "Saving..." : `Change to ${targetRole}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
