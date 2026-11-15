-- Tipo do ativo do patrimônio: terra, animais, maquinas ou instalacoes.
--
-- A produção já tinha este CHECK (criado direto no painel do Supabase, fora das migrations), mas o
-- site deixava digitar qualquer texto — salvar "Trator" falhava. Agora o site usa uma lista com
-- esses quatro valores (TIPOS_ATIVO em src/app/(app)/fazenda-types.ts) e a regra fica registrada
-- aqui, pra o banco montado do zero ser igual à produção. Nulo continua aceito (dado antigo).

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'patrimonio_tipo_ativo_check') then
    alter table patrimonio add constraint patrimonio_tipo_ativo_check
      check (tipo_ativo = any (array['terra'::text, 'animais'::text, 'maquinas'::text, 'instalacoes'::text]));
  end if;
end $$;
