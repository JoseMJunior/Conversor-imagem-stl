# Contorno Studio

Aplicação web em Next.js 16, Tailwind CSS 4 e TypeScript para transformar logos e desenhos em SVG ou STL com espessura.

## Usar

1. Abra ou arraste uma imagem PNG, JPG ou WebP de até 50 MB.
2. Confira o desenho na aba Contorno e ajuste detecção, limiar, inversão, simplificação e remoção de pontos.
3. Defina a largura em milímetros. A altura acompanha a proporção do contorno.
4. Para STL, configure a espessura e, se desejar, uma base retangular que une as partes soltas.
5. Escolha SVG ou STL e clique em Salvar. O navegador inicia o download.

No celular, o botão Ajustes abre os controles. Na prévia 3D, arraste para girar, aproxime com o gesto de pinça e dê dois cliques para centralizar.

## Privacidade e geometria

As imagens são processadas no navegador, em um Web Worker, sem envio para servidor. O carregamento inicial do site e do motor WebAssembly exige internet. Não há conta, banco de dados, telemetria ou serviço de IA.

Se o download do motor de conversão falhar, a interface informa o problema. Verifique a conexão e ajuste uma opção ou restaure os ajustes para tentar novamente.

Imagens maiores que 2.048 pixels no maior lado são reduzidas proporcionalmente, com aviso na interface. A largura considera o contorno, sem as bordas vazias da imagem. A simplificação e a área mínima usam pixels da imagem de processamento.

SVG preserva os contornos e furos em uma cor, com tamanho em milímetros. STL contém uma malha fechada, com coordenadas na convenção de milímetros dos fatiadores. Sem base, partes separadas permanecem como corpos soltos no mesmo STL. A base é unida geometricamente ao desenho e não aparece no SVG. Sua altura total corresponde à espessura da placa mais a espessura do desenho; os furos do relevo terminam na placa.

## Desenvolvimento

Requer Node.js 24 e npm. Execute npm ci e npm run dev. O site abre em http://localhost:3000.

Comandos:

- npm run build: build de produção Next.js.
- npm start: servidor de produção.
- npm run typecheck: verificação de tipos.
- npm test: testes de geometria, furos, fechamento, volume e reimportação do STL.
- npm run test:e2e: teste no Chrome instalado, com upload, download real dos arquivos, prévia e layout móvel.

O teste de integração inicia o servidor de produção na porta 3010 e grava relatórios e capturas em test-results/web. Para testar uma publicação, defina TEST_URL com a URL desejada antes de executar npm run test:e2e.

Antes do teste de integração, execute npm run build. A suíte também verifica se a prévia preserva as coordenadas do STL e se a conversão se recupera de uma falha temporária no carregamento do WebAssembly.

## Deploy na Vercel

O projeto usa o preset Next.js, Node.js 24, npm ci e npm run build. Não exige variáveis de ambiente. O script postinstall copia o carregador e o binário do Manifold para public/wasm, incluídos no deploy. O arquivo vercel.json contém as opções de build.

A pasta .vercel contém somente o vínculo local com a conta e permanece fora do controle de versão. Para publicar atualizações, confira o projeto com vercel project inspect e execute vercel deploy --prod no espaço vinculado.

## Controle de versão

O código, as configurações e package-lock.json são versionados. Dependências, builds, relatórios de teste, arquivos .env, vínculo local da Vercel, arquivos gerados do Manifold e result.json do fatiador são ignorados. O arquivo next-env.d.ts é regenerado pelo Next.js. Depois de clonar, npm ci prepara o WebAssembly e npm run build gera os artefatos do Next.js; nenhuma configuração pessoal da Vercel é necessária para executar o projeto localmente.

## Estrutura

- src/app: App Router, metadados e estilos Tailwind.
- src/components: interface, upload, Web Worker e prévia 3D.
- src/core: vetorização, geometria Manifold e exportação STL.
- src/shared: contratos e opções de conversão.
- scripts/prepare-wasm.mjs: empacotamento dos arquivos WebAssembly.

A aplicação requer um navegador moderno com WebAssembly. A prévia 3D usa WebGL; quando indisponível, o contorno e os downloads continuam disponíveis. A geração extruda contornos de logos e desenhos; fotografias podem precisar de uma preparação do fundo.
