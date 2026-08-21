'use client';

import { useState } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { notify } from '../../lib/notify';
import { useRouter } from '../../lib/useRouter';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
} from '@/components/ui/card';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';

export default function LoginForm({ next = '/' }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      notify.error(data.error || 'Could not sign in.');
      setBusy(false);
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <div className="auth-screen bg-muted/60">
      <Card className="w-full max-w-[26rem] gap-0 rounded-[8px] py-0 shadow-none ring-1 ring-black/5 [--card-spacing:--spacing(8)]">
        <CardHeader className="px-8 pt-10 pb-2">
          <div className="flex flex-col items-center text-center">
            <img
              src="/icon.svg"
              alt="Syncup Workspace"
              width={44}
              height={44}
              className="size-11 rounded-[6px]"
            />
            <p className="mt-4 text-xl font-semibold tracking-tight">Syncup Workspace</p>
          </div>
        </CardHeader>

        <CardContent className="px-8 pt-8 pb-10">
          <form onSubmit={submit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email" className="text-sm font-medium capitalize">
                  Work email
                </FieldLabel>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@syncup.in"
                  required
                  className="h-11 rounded-[6px] text-[15px] md:text-[15px]"
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="password" className="text-sm font-medium capitalize">
                  Password
                </FieldLabel>
                <InputGroup className="h-11 rounded-[6px]">
                  <InputGroupInput
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="rounded-[6px] text-[15px] md:text-[15px]"
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      size="icon-xs"
                      className="rounded-[6px]"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      aria-pressed={showPassword}
                      title={showPassword ? 'Hide password' : 'Show password'}
                      onClick={() => setShowPassword((visible) => !visible)}
                    >
                      {showPassword ? <EyeOff /> : <Eye />}
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
              </Field>

              <Button
                type="submit"
                size="lg"
                className="mt-1 h-11 w-full cursor-pointer rounded-[6px] bg-neutral-950 text-[15px] font-medium text-white hover:bg-neutral-800 active:scale-[0.99] active:bg-black"
                disabled={busy}
              >
                {busy ? <Loader2 className="animate-spin" /> : null}
                {busy ? 'Logging in…' : 'Log in'}
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
