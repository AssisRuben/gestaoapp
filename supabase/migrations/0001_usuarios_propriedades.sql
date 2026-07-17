-- Vincula usuários do Supabase Auth (auth.users) a propriedades, permitindo que um
-- técnico/zootecnista atenda mais de uma propriedade e que um produtor acesse a sua.
-- Habilita RLS em propriedades e nesta tabela nova (as demais tabelas de dados ficam
-- para quando cada módulo específico for construído).

create table if not exists usuarios_propriedades (
  usuario_id uuid not null references auth.users(id) on delete cascade,
  propriedade_id uuid not null references propriedades(id) on delete cascade,
  papel text not null default 'produtor', -- 'produtor' | 'tecnico' | 'admin'
  created_at timestamptz not null default now(),
  primary key (usuario_id, propriedade_id)
);

alter table usuarios_propriedades enable row level security;
alter table propriedades enable row level security;

create policy "usuario ve seus vinculos"
  on usuarios_propriedades for select
  using (usuario_id = auth.uid());

create policy "usuario ve propriedades vinculadas"
  on propriedades for select
  using (
    exists (
      select 1 from usuarios_propriedades up
      where up.propriedade_id = propriedades.id
        and up.usuario_id = auth.uid()
    )
  );
