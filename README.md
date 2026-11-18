# 🎖️ The Battle for Hill 218 (versión para celulares)

Versión web instalable (PWA) de **The Battle for Hill 218**, el juego de cartas de estrategia para dos de
Darwin Kastle publicado por Your Move Games. Es la misma lógica que la versión gratuita para PC en Java
(de Andrew Gross, `hill218.jar`), rehecha en HTML/CSS/JS para jugar con el celular en vertical.
Sin publicidad y funciona sin internet.

**Abrir el juego:** https://tenehuini.github.io/bfh218/

## Probarlo en la compu

```bash
cd bfh218
python3 -m http.server 8000
```

Y abrir http://localhost:8000 (en Chrome, con las herramientas de desarrollo en modo celular).
Con `?delay=150` en la dirección, la computadora juega más rápido (útil para probar).

## Publicarlo

Se publica con GitHub Pages desde la rama `main` (carpeta raíz) del repositorio
`Tenehuini/bfh218`. Cada `git push` a `main` actualiza el sitio en un par de minutos.

## Instalar la aplicación en el celular

### Android
1. Abrí **Chrome** y entrá a https://tenehuini.github.io/bfh218/
2. Tocá el menú **⋮** (arriba a la derecha).
3. Elegí **Instalar app** (o **Agregar a pantalla principal**).
4. Confirmá con **Instalar**.

### iPhone
1. Abrí **Safari** y entrá a https://tenehuini.github.io/bfh218/
2. Tocá **Compartir** (el cuadrado con la flecha hacia arriba).
3. Elegí **Agregar a inicio** y tocá **Agregar**.

La pantalla de inicio del juego tiene el botón **📲 Cómo instalar la app** con estos mismos pasos.

## Cómo se juega

Ver el botón **📜 Cómo se juega** en la app. En la pantalla de inicio se elige:

- **Contra quién jugás**: computadora difícil, computadora fácil u otra persona (dos jugadores con el
  mismo celular, que se lo pasan en cada turno).
- **Tu ejército**: azul o verde.
- **Empezás**: primero, segundo o al azar.

Durante la partida, mantené presionada cualquier carta (de la mano o del tablero) para verla bien grande
(se cierra al soltarla). Tocá una carta del tablero para ver su información y la barra de los ejércitos
para ver las bajas.

## Estructura

```
bfh218/
├── index.html      # Pantallas y diálogos
├── styles.css      # Estilos
├── game.js         # Reglas del juego (sin DOM): mazo, suministro, despliegue, ataques, fin
├── ai.js           # Computadora (port de ComputerOpponent.java)
├── app.js          # Pantallas, tablero, mano, turnos y guardado
├── sw.js           # Cache para jugar sin conexión
├── manifest.json   # Datos para instalarla como app
└── assets/         # Cartas (WebP desde hill218.jar/img), título, logo e íconos
```

## Diferencias con la versión para PC

- El juego en red (host/cliente) se reemplazó por **dos jugadores en el mismo celular**, con una pantalla
  para pasarse el celular sin ver la mano del otro.
- Si ninguna carta de la mano se puede jugar, se descarta una (en el original el juego se trababa).
- La computadora tiene en cuenta todos los blancos posibles de cada unidad (en el original, por un error,
  solo miraba uno), así que juega un poco mejor.
- Se gana apenas se ocupa la base enemiga, también a mitad de turno.
- La velocidad de la computadora es fija (alrededor de un segundo por jugada).

## Para quien mantiene el juego

Cada vez que se publica un cambio, subí el número de `CACHE` en `sw.js` (por ejemplo de
`bfh218-v1` a `bfh218-v2`) para que los celulares descarguen los archivos nuevos.
La partida en curso se guarda en el celular (`localStorage`) y se puede continuar desde el inicio.

Para probar la lógica sin navegador: `game.js` y `ai.js` se pueden cargar con `require` en Node
(por ejemplo, para simular partidas de la computadora contra sí misma).
