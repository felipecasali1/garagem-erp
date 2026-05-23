import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Eye, EyeOff, Lock, Mail, Car, TrendingUp, Shield } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Checkbox } from "@/shared/components/ui/checkbox";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Entrar | GaragemERP" }] }),
  component: LoginPage,
});

function LoginPage() {
  const [show, setShow] = useState(false);
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Brand panel */}
      <div className="hidden lg:flex relative bg-sidebar text-sidebar-foreground p-12 flex-col justify-between overflow-hidden">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, var(--primary) 0%, transparent 40%), radial-gradient(circle at 80% 80%, var(--info) 0%, transparent 40%)",
          }}
        />
        <div className="relative z-10 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-display font-bold text-lg">
            G
          </div>
          <span className="font-display font-semibold text-xl">GaragemERP</span>
        </div>

        <div className="relative z-10 space-y-6 max-w-md">
          <h1 className="text-4xl font-display font-bold leading-tight">
            Gestão completa para sua revenda de veículos.
          </h1>
          <p className="text-sidebar-foreground/70 text-lg">
            Estoque, vendas, comissões e financeiro - em uma plataforma única.
          </p>
          <ul className="space-y-3 text-sidebar-foreground/80">
            <li className="flex items-center gap-3">
              <Car className="h-5 w-5 text-primary" />
              Controle total do estoque de veículos
            </li>
            <li className="flex items-center gap-3">
              <TrendingUp className="h-5 w-5 text-primary" />
              Análises financeiras em tempo real
            </li>
            <li className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-primary" />
              Comissões e contratos centralizados
            </li>
          </ul>
        </div>

        <div className="relative z-10 text-xs text-sidebar-foreground/50">
          GaragemERP © 2026 - Sistema de Gestão
        </div>
      </div>

      {/* Form */}
      <div className="flex items-center justify-center p-6 lg:p-12 bg-background">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-display font-bold">
              G
            </div>
            <span className="font-display font-semibold text-lg">GaragemERP</span>
          </div>

          <div className="space-y-2 mb-8">
            <h2 className="text-2xl font-display font-semibold">Bem-vindo de volta</h2>
            <p className="text-sm text-muted-foreground">
              Entre com suas credenciais para acessar o sistema.
            </p>
          </div>

          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              window.location.href = "/";
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input id="email" type="email" placeholder="voce@garagem.com" className="pl-9" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={show ? "text" : "password"}
                  placeholder="••••••••"
                  className="pl-9 pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox id="remember" />
              <Label htmlFor="remember" className="text-sm font-normal cursor-pointer">
                Lembrar de mim
              </Label>
            </div>

            <Button type="submit" className="w-full" size="lg">
              Entrar
            </Button>
          </form>

          <p className="text-xs text-muted-foreground text-center mt-8">
            Acesso restrito a colaboradores autorizados.{" "}
            <Link to="/" className="text-primary hover:underline">
              Voltar
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
