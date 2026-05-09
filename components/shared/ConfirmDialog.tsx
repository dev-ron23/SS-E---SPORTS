'use client'

import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { GlassButton } from '@/components/glass/GlassButton'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description: string
  onConfirm: () => void
  onCancel: () => void
  destructive?: boolean
}

export function ConfirmDialog({
  open,
  title,
  description,
  onConfirm,
  onCancel,
  destructive = false,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onCancel() }}>
      <AnimatePresence>
        {open && (
          <DialogContent showCloseButton={false} className="bg-[#0f0f1a] border-white/10 text-white">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              <DialogHeader>
                <DialogTitle className="text-white">{title}</DialogTitle>
                <DialogDescription className="text-white/60">{description}</DialogDescription>
              </DialogHeader>

              <DialogFooter className="mt-4 bg-transparent border-none flex flex-row gap-2 justify-end">
                <GlassButton variant="ghost" onClick={onCancel}>
                  Cancel
                </GlassButton>
                <GlassButton
                  variant={destructive ? 'danger' : 'primary'}
                  onClick={onConfirm}
                >
                  Confirm
                </GlassButton>
              </DialogFooter>
            </motion.div>
          </DialogContent>
        )}
      </AnimatePresence>
    </Dialog>
  )
}
