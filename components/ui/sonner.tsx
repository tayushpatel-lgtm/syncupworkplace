"use client"

import type { CSSProperties } from "react"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import {
  CircleCheckIcon,
  CircleXIcon,
  InfoIcon,
  Loader2Icon,
  TriangleAlertIcon,
} from "lucide-react"

const iconClass = "size-7 fill-current stroke-white [&_path]:fill-none"

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      closeButton
      position="top-center"
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className={`${iconClass} text-[#22c55e]`} strokeWidth={2} />,
        info: <InfoIcon className={`${iconClass} text-[#3b82f6]`} strokeWidth={2} />,
        warning: (
          <TriangleAlertIcon
            className={`${iconClass} text-[#f59e0b] [&_path:first-child]:fill-current`}
            strokeWidth={2}
          />
        ),
        error: <CircleXIcon className={`${iconClass} text-[#ef4444]`} strokeWidth={2} />,
        loading: <Loader2Icon className="size-7 animate-spin text-neutral-400" strokeWidth={2} />,
      }}
      style={
        {
          "--normal-bg": "#ffffff",
          "--normal-text": "var(--foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "8px",
        } as CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
          title: "cn-toast-title",
          description: "cn-toast-description",
          icon: "cn-toast-icon",
          closeButton: "cn-toast-close",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
