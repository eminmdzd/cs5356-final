"use client"

import { EyeIcon, EyeOffIcon } from "lucide-react"
import { type ComponentProps, useState } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function PasswordInput({
  className,
  onChange,
  ...props
}: ComponentProps<typeof Input>) {
  const [disabled, setDisabled] = useState(true)
  const [isVisible, setIsVisible] = useState(false)

  return (
    <div className="relative">
      <Input
        className={cn("pr-10", className)} // Ensure padding on the right
        {...props}
        type={isVisible ? "text" : "password"}
        onChange={(event) => {
          setDisabled(!event.target.value)
          onChange?.(event)
        }}
      />

      <Button
        className="absolute top-0 right-0 hover:bg-transparent"
        disabled={disabled}
        size="icon"
        type="button"
        variant="ghost"
        onClick={() => setIsVisible(!isVisible)}
      >
        {isVisible ? <EyeIcon className="h-4 w-4" /> : <EyeOffIcon className="h-4 w-4" />}
      </Button>

      <style>{`
        .hide-password-toggle::-ms-reveal,
        .hide-password-toggle::-ms-clear {
          visibility: hidden;
          pointer-events: none;
          display: none;
        }
      `}</style>
    </div>
  )
}