import * as React from "react"
import { cn } from "../utils"
import { Button } from "./button"

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  onConfirm: () => void
  destructive?: boolean
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText = "Confirmer",
  cancelText = "Annuler",
  onConfirm,
  destructive = false,
}: ConfirmDialogProps) {
  const dialogRef = React.useRef<HTMLDialogElement>(null)

  React.useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  React.useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const handleClose = () => onOpenChange(false)
    const handleClick = (e: MouseEvent) => {
      if (e.target === dialog) {
        onOpenChange(false)
      }
    }
    dialog.addEventListener("close", handleClose)
    dialog.addEventListener("click", handleClick)
    return () => {
      dialog.removeEventListener("close", handleClose)
      dialog.removeEventListener("click", handleClick)
    }
  }, [onOpenChange])

  return (
    <dialog
      ref={dialogRef}
      className={cn(
        "backdrop:bg-black/80 open:animate-in open:fade-in-0 open:zoom-in-95",
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 sm:rounded-lg",
        "m-0 max-h-screen" // reset native dialog margin
      )}
    >
      <div className="flex flex-col space-y-2 text-center sm:text-left">
        <h2 className="text-lg font-semibold leading-none tracking-tight">{title}</h2>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 mt-4">
        <Button variant="outline" onClick={() => onOpenChange(false)} className="mt-2 sm:mt-0">
          {cancelText}
        </Button>
        <Button
          variant={destructive ? "destructive" : "default"}
          onClick={() => {
            onConfirm()
            onOpenChange(false)
          }}
        >
          {confirmText}
        </Button>
      </div>
    </dialog>
  )
}
