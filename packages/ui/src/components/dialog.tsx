import * as React from "react"
import { cn } from "../utils"

export interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
  className?: string
}

export function Dialog({
  open,
  onOpenChange,
  children,
  className,
}: DialogProps) {
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
        "m-0 max-h-screen", // reset native dialog margin
        className
      )}
    >
      {children}
    </dialog>
  )
}
