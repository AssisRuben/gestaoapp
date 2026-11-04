-- Cadastro "Sou produtor" com um WhatsApp que já é de uma fazenda (04/11/2026): o banco não cria
-- outra fazenda (0046) e a conta cai na tela "Falta liberar seu acesso", que parecia a de técnico —
-- o produtor achava que o cadastro tinha dado errado. Agora o site confere o número assim que ele é
-- digitado e avisa ANTES de criar a conta (corrigir o número ou seguir e pedir o acesso ao gestor).
--
-- Chamada antes do login (anon). Só responde sim/não: não diz qual fazenda nem de quem é o número.

create or replace function whatsapp_ja_cadastrado(p_whatsapp text) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select length(regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g')) >= 10
     and exists (
       select 1 from usuarios_whatsapp
       where public._telefone_chave(telefone) = public._telefone_chave(p_whatsapp)
     );
$$;

revoke execute on function whatsapp_ja_cadastrado(text) from public;
grant execute on function whatsapp_ja_cadastrado(text) to anon, authenticated;
