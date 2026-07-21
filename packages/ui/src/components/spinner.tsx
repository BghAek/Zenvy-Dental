import * as React from "react"
import { Loader2 } from "lucide-react"
import { cn } from "../utils"

export interface SpinnerProps extends React.SVGProps<SVGSVGElement> {
  size?: number
}

export function Spinner({ className, size = 24, ...props }: SpinnerProps) {
  return (
    <Loader2
      className={cn("animate-spin text-primary", className)}
      size={size}
      {...props}
    />
  )
}
