# Beslutsdokument: rendering

*Ett av teamets beslutsdokument. Skrivs i M10. Högst en sida. Frågan är var guidesidorna ska ritas: i browsern som i dag (CSR), på servern för varje besök (SSR) eller en gång vid bygget (SSG). Ni ska inte bygga om Utpost i Nuxt – ni ska kunna försvara valet.*

**Datum:**
**Beslut:** *(en eller två meningar: hur ritas guidesidorna, och hur ritas resten av appen?)*

## Bakgrund
*Skuld 11: ingen SSR, långsam LCP på mobil. Vad får en besökare – och en sökmotor – tillbaka när de frågar efter en guide i dag? Två meningar, med det ni såg med `curl` mot er egen staging.*

## Alternativ
*Det ni valde och ett alternativ ni valde bort. Spiken i `spike/nuxt-guider/` visar SSR och SSG mot samma API.*

| | Det vi valde | Det vi valde bort |
|---|---|---|
| Var sidan ritas, och när | | |
| Vad som står i HTML:en från servern | | |
| När syns en ändring redaktören publicerat | | |
| Vad det kostar oss (en server till, byggtid, två kodbaser) | | |

## Motivering
*Varför räcker valet för Utpost just nu? Knyt till vilka sidor det gäller: guiderna är redaktionellt innehåll som alla ser likadant, turerna och uppladdningen är inloggat.*

## Vad som hade fått oss att byta
*En eller två konkreta saker: lanseringen i Norge och sökmotorerna, en siffra i `docs/performance.md`, antalet guider.*

## Konsekvenser
*Vad betyder valet för staging i Azure (en container till, eller statiska filer)? För webhooken från CMS:et (M9)? För inloggningen?*
