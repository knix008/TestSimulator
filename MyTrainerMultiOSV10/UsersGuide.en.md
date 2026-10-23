# MyTrainer User's Guide

MyTrainer lets you **draw** neural networks, prepare data, train them and **watch what every layer and neuron does**. A trained model can be tried straight away — draw a picture, click a point, type values — and the same model is available as **PyTorch code** that you can edit and run with PyTorch.

- The same app runs in a web browser and on Windows, macOS and Linux (Tauri 2).
- Two training engines: **TensorFlow** inside the app (TensorFlow.js — WebGPU · WebGL · CPU), and **PyTorch** through this computer's Python (desktop app).
- 23 sample models (MLP, CNN, autoencoders, RNN · LSTM · GRU, Conv1D, embeddings, residual connections, wide & deep), all with data generated offline.

![Start page](docs/images/start.png)

## Quick start

1. On the start page, click a **sample model** (e.g. "Spiral (3 classes)").
2. Press **F5** (or ▶ on the toolbar): training starts and the **Train** tab draws the loss and accuracy curves and the decision boundary live.
3. In the **Model** tab, press **Neuron view** and click a neuron: the **Properties** panel on the right shows its arithmetic (inputs × weights + bias → activation) with the real numbers.
4. In the **Test** tab, step through test samples — or, for the digit samples, draw a digit — and see the prediction.

## The window

| Where | What |
|---|---|
| Menu bar | Home · File · Edit · View · Model · Data · Train · Help. It is also the title bar (drag to move the window, double-click to maximize). |
| Toolbar | New · open · save, undo / redo, add layer · auto layout · fit · neuron view, start · pause · one batch · stop · reset, **engine (TensorFlow / PyTorch)**, theme · language · settings |
| Left: layer palette | Every layer and block: drag onto the model or click to add. The project name and description below. |
| Centre: work tabs | **Data · Model · Code · Train · Test** (Ctrl+1 … Ctrl+5) |
| Right: properties | The selected layer's settings, the selected neuron's arithmetic, or — nothing selected — the model summary and its problems |
| Bottom panel | Console (engine messages, Python output), model summary table, problem list |
| Status bar | Notices, saved state, engine, parameter count, training state, language |

## Data tab

![Data tab](docs/images/data.png)

### Where the data comes from

- **Built-in datasets** — 2-D points (XOR, circles, moons, spiral, blobs, checkerboard), functions and tables (line, sine, Friedman), pictures (digits 0–9, shapes, coloured shapes, objects), letters (English A–Z, Hangul consonants), **speech commands** (formant synthesis, mel spectrogram), **video** (clips of moving objects), sequences (sine forecasting, patterns, counting ones, motion sensor) and text (short sentence sentiment, **English and Korean sentences for character-level language models**). Change the sample count, noise, seed … and the data is generated again at once.
- **Recorded speech (real data)** — **Korean keywords: 출근 · 퇴근 · 경비 · 해제** (clock in · clock out · arm · disarm). 5520 clips (3840 keywords + 1680 unknown) from 120 Supertonic TTS voices (the built-in 5 male and 5 female, 30 blends of two and 80 nudged mixes of three) as a statement, a command and a question at several speeds, plus about 120 similar-sounding and everyday words (unknown: 출발 · 퇴장 · 경보 · 해지 …). **Augmented copies** (speed and pitch, time shift, gain, microphone colour, room echo, background noise, people talking behind, VTLP, SpecAugment) and a **background noise class** can be added. Making the spectrograms of all copies takes a while the first time; a progress window shows how far it is.
- **Import CSV** — comma, semicolon and tab are detected. Pick the target column: text or few distinct values make it **classification**, otherwise **regression**. Text feature columns become one-hot columns; missing numbers get the column mean. Try `samples/student-pass.csv` (pass / fail, classification) and `samples/house-prices.csv` (regression).
- **Import a picture folder** — sub-folder names are the classes (`cats/`, `dogs/` …). PNG · JPEG · GIF · WebP · BMP · AVIF · ICO · SVG · **TIFF · TGA** are read.
- **Import a sound folder** — sub-folder names are the classes. WAV · MP3 · OGG · FLAC · M4A · WebM are read; the loudest second is kept at 8 kHz.

The `data/` folder has ready examples: CSV (`csv/`), pictures (`images/`), sounds (`audio/speech/`, `audio/kws-ko/`) and files to predict (`predict/`). See `data/README.md`.

Click a sample to make it the **probe input**: the neuron view and the Train tab's neuron picture show that input passing through the network. The mouse wheel pages through the samples.

### Preprocessing steps

| Step | What it does |
|---|---|
| Standardize | (x − μ) / σ with the training data's mean and standard deviation |
| Min-max scaling | Maps the training data's min…max onto a range |
| Polynomial features | Adds products x₁², x₁x₂ … (see the sample where one neuron draws a round boundary) |
| Clip | Limits outliers to a range |
| Noise · horizontal flip · shift augmentation | Adds transformed copies to the **training data only** |
| Invert brightness | 1 − x |

Statistics (means, ranges) are fitted on the **training part only** and applied to the validation and test parts. Steps can be switched off and reordered. The **Original / Preprocessed** buttons show the difference.

### Split

Validation and test percentages, the shuffle seed and **keep class proportions** (stratified). The bar below shows the three parts.

## Model tab — building models without code

![Layer graph](docs/images/model-graph.png)

The model is a graph of layer cards and wires. A card shows the layer's name, type and main settings, its **output shape**, its parameter count and, once there are activations, an **activation strip**.

| To … | Do this |
|---|---|
| Add a layer | **Drag** a layer from the palette onto the canvas · select a layer and **click** a palette layer (inserted after it) · **double-click** an empty spot |
| Insert between two layers | Drop a palette layer **onto a wire** · right-click a wire → "Insert a layer on this wire" |
| Connect | Drag a layer's bottom dot (output port) onto another layer |
| Disconnect | Click a wire and press Delete · right-click → Delete the wire |
| Quick edits | A selected layer shows buttons: **insert above · add below · neurons/filters −/+ · change to another layer · duplicate · residual connection · delete** |
| Several layers at once | **Blocks** (Dense+BN+ReLU+dropout, Conv+BN+ReLU+pooling, classifier head, two LSTM layers …) |
| Change settings | The properties panel: name (the variable name in the code), type, neurons, activation, kernel size … |
| Tidy up | **Auto layout** (Ctrl+L), **fit** (Ctrl+0), zoom (Ctrl+wheel, Ctrl+= / Ctrl+-) |
| Select | Click, Shift+click, Shift+drag (rectangle), Ctrl+A |

Shapes are computed from the data to the output; a mismatch marks the card in red with an explanation (e.g. "Needs a picture input (height, width, channels)", "The output shape (3) differs from the (4) the data wants"). The state line above the model and the **Problems** tab list everything; clicking a problem goes to its layer. When the data changes, the output layer's units and activation follow the task.

### Neuron view

![Neuron view](docs/images/neuron-view.png)

The network drawn **unit by unit**, from the input (left) to the output (right).

- Vector layers are **neuron circles** (colour = activation), picture layers are **feature maps per channel**, sequence layers are **one strip per unit across time**.
- Lines between dense layers are **weights**: blue negative, red positive, thicker and darker when larger.
- When a new snapshot arrives, the signal **sweeps** from the input to the output.
- **Click a neuron, a pixel of a feature map or a time step** to see in the properties panel how its value was computed.

| Layer | The properties panel shows |
|---|---|
| Dense | z = Σ xᵢ·wᵢ + b, contributions of the most influential inputs as bars and a table, z on the activation function's graph, the result a |
| Convolution | The receptive field at that position × the filter's weights (a picture per input channel), the sum, the activation |
| Pooling | The values in the window and max / mean |
| Batch normalization | (x − μ) / √(σ² + ε) · γ + β |
| LSTM · GRU · RNN | The gates over time (input, forget, candidate, output / update, reset, candidate) with the hidden and cell state |
| Embedding | The word id and its row (vector) |
| Add · Concatenate | The value from each input |

The **✓ engine** mark next to the result says that the value recomputed with the formula equals the value the engine (TensorFlow or PyTorch) actually computed.

![CNN neurons](docs/images/cnn-neurons.png)

![LSTM gates](docs/images/lstm-gates.png)

## Code tab — PyTorch code

![Code tab](docs/images/code.png)

A **complete PyTorch script** holding the model and the training settings:

- A `CONFIG` dictionary (epochs, batch size, learning rate …), `class Net(nn.Module)` with `__init__` (the layers) and `forward` (the computation), the loss, an evaluation function and the training loop.
- Axis orders (the app is channels-last, PyTorch channels-first) appear as `permute` / `transpose` calls with comments.
- The `mytrainer_bridge` module (`mt`) talks to the app: `mt.load_data()` (the preprocessed data), `mt.batches()` (also handles pause and stop), `mt.trace(name, tensor)` (records a layer output), `mt.watch(model, loss_fn)` (weights and gradients), `mt.report_epoch()`, `mt.finish()`, `mt.serve()` (answers test requests after training). With **visualization hooks** off, the code has no `mt.trace` lines.
- The code follows model changes. **Edit it** and it becomes "your edited code": it is kept, and the PyTorch engine runs it. **Regenerate from the model** brings the generated code back.
- Editor: Python highlighting, completion (Ctrl+Space), help on hover, syntax errors, find (Ctrl+F), line wrapping, font size.
- **Python · PyTorch dictionary** (right): grammar (if · for · def · class · with · try · comprehensions · f-strings · slicing), keywords, built-in functions, **dictionary methods** (keys · values · items · get · update · pop · setdefault …), lists and strings, torch · tensors · nn · F · optim and the MyTrainer functions, explained in Korean and English with examples; **Insert at the cursor** puts one in the code.
- **Save .py** writes the script to a file.

## Train tab

![Train tab](docs/images/train.png)

| Setting | Meaning |
|---|---|
| Model | For a sample with several models (e.g. **ResNet CNN / DS-CNN / BC-ResNet** for Korean keyword spotting) pick the one to train. Edits are kept per model. |
| Engine | **TensorFlow** (TensorFlow.js in the app; backend WebGPU → WebGL → CPU, chosen automatically) or **PyTorch** (desktop) |
| Optimizer | Adam, SGD, SGD + momentum, RMSprop, Adagrad, Adadelta, Adamax |
| Learning rate · schedule | Constant, step decay, exponential decay, cosine |
| Loss | Automatic (classification: cross-entropy; regression and reconstruction: MSE), MAE, Huber |
| Weight decay · early stopping · patience | Less overfitting |
| Snapshot every | How often (epochs) every layer's activations, weights and gradients are fetched |
| Label smoothing · mixup (α) (advanced) | Targets of (1−ε) instead of 100 % / training on blends λ : 1−λ of two samples and their targets (λ ~ Beta(α, α)); both classification only. Mixup makes a model steadier on data it has not seen; the Korean keyword sample uses 0.3 |

**Start (F5) · pause / resume (F6) · one batch (F10) · stop (Shift+F5) · reset**. With TensorFlow, a stopped run can **continue**. When preparing the data and the model and the first epoch take a while, a **progress window** shows how far it is; it also appears while a large dataset such as the sound clips is made for the first time.

Every chart card has a title; hover over it (ⓘ) to see what the card shows (the Data and Test tabs work the same way). For classification, the **output probabilities** card shows each class's probability (e.g. 경비 · 출근 · 퇴근 · 해제) for the probe input under the current model; the bar in bold text is the true class. At the top, the probe input's **neuron activity** shows it passing through the network while you train. Below it the charts: loss (train / validation; earlier runs dashed), accuracy or learning rate, the **decision boundary** (2-D points) · **fitted curve** (1-D functions) · **original / reconstructed** (autoencoders) · output probabilities, **gradient flow** (mean |∇W| per layer — small red bars in the early layers mean vanishing gradients) and the **weight distribution per layer**.

## Test tab

![Test tab](docs/images/test.png)

- **Test sample**: previous / next / random; after an evaluation, **mistakes only**.
- **Your own input**: **draw** pictures in the black square, **click** the plane for 2-D points, **type** a sentence (click known words to add them), or type values in their original units for tables and functions (the preprocessing is applied for you).
- The input passing through the network is shown as a large neuron view, with the prediction (class probabilities · value · reconstruction).
- **Evaluation** (automatic after training): accuracy, macro F1, loss, per-class precision · recall · F1, the **confusion matrix** (click a cell to list only those mistakes), pictures of the mistakes (click one to use it as input). Regression: MAE · RMSE · R², predicted vs actual and the error distribution.

After training, the PyTorch engine keeps its run alive (`mt.serve`) to answer test requests; **End PyTorch** ends it.

## The PyTorch engine and the Python environment

![Python / PyTorch environment](docs/images/pyenv.png)

**Train › Python / PyTorch environment…** lists the Pythons on this computer.

1. **What is already installed is used first.** MyTrainer looks at the `MYTRAINER_PYTHON` variable, its own environment, an active virtual environment, conda environments (active, and the envs of anaconda · miniconda · miniforge), PATH, the Windows `py` launcher, the usual install folders and pyenv, and asks each Python whether it has PyTorch. When several have it, the order is **CUDA (NVIDIA GPU) → Apple MPS → MyTrainer's own → newest PyTorch**; **Use this** picks another one.
2. **PyTorch is installed only when none has it.** Pick a base Python (64-bit CPython 3.9 or newer; 3.10–3.13 preferred) and a kind (automatic: CUDA with an NVIDIA GPU, otherwise CPU / CPU only / CUDA / PyPI default) and press **Install PyTorch**: a **virtual environment of MyTrainer's own** is created in the app's data folder and pip installs torch and numpy into it. Other Pythons are left alone. The installation log is shown in the window.
3. With no Python at all, Windows offers **Install Python 3.12 (winget)**. On macOS and Linux install Python with python.org, Homebrew or your package manager, then press **Detect again**.

A PyTorch run gets a folder (`runs/` in the app's data folder) with the script (`train.py`), the bridge module and the preprocessed data (`meta.json`, `x_train.f32` …). The script's `print` output and errors (tracebacks) appear in the console.

## Sample models

| Group | Samples |
|---|---|
| Classification basics | XOR, circles, polynomial features + logistic regression, two moons, spiral (3 classes), softmax regression, checkerboard + batch norm |
| Regression | Linear regression, sine curve fitting, tabular regression (Friedman) |
| Tables (CSV) | Student pass prediction, house prices |
| Pictures (CNN) | Digits (MLP), digits (CNN), shapes (CNN + BN + augmentation), coloured shapes (RGB CNN), objects (CNN) |
| Letters (OCR) | English capitals, Hangul consonants |
| Speech | Speech commands (CNN · GRU), **keyword spotting DS-CNN · BC-ResNet (embedded)**, **Korean keyword spotting: 출근 · 퇴근 · 경비 · 해제** (Supertonic voices; ResNet CNN / DS-CNN / BC-ResNet) |
| Video | Action recognition (frames + LSTM, stacked-frame CNN) |
| Language models (LLM) | **Mini GPT** (English · Korean, character-level transformer), LSTM language model |
| Autoencoders | Autoencoder, convolutional autoencoder |
| Sequences · text | Forecasting (LSTM), pattern classification (GRU), counting ones (RNN), activity recognition (Conv1D), sentiment (embedding + LSTM) |
| Graph structures | Residual connection (ResNet block), wide & deep (concatenate) |

Open them from **File › Sample models…** (the gallery) or the start page. The `samples/` folder has `.mytrain` files of some samples and the CSV examples.

## Files

- **Projects (.mytrain)** are JSON files with the data recipe (source, preprocessing, split), the model graph, the training settings, the engine, the PyTorch code (when edited), past runs and — depending on the settings — the **trained weights** (TensorFlow.js). CSV and picture data are stored inside, so a project opens anywhere.
- On the desktop, double-clicking a `.mytrain` file opens it in MyTrainer.
- Unsaved work is remembered: **Continue** on the start page opens it again.

## Start page

The sample gallery, recent files and **twenty AI-themed moving backgrounds** (neural signals, gradient descent, attention, convolution, embedding space, tensors, activation functions, backpropagation, decision boundary, loss curves, dropout, token stream, diffusion, k-means, decision tree, firing neurons, weight matrix, latent space, recurrent network, GAN distributions). Pick one or a random one, set the speed and how often it changes. **Home** on the menu bar brings the page back.

## Settings

**Edit › Settings…**: language (한국어 / English), start page, ask to save on exit, save weights / theme (20 light · 20 dark · system) / font, size, weight / visualization (colour map, neurons shown per layer, signal animation) / code (font size, wrapping, visualization hooks) / PyTorch (Python path, build to install). Changes (theme, font, language …) **apply to the main window at once**. **OK** keeps them, **Cancel** (or ×, Esc) puts back the settings the window opened with, and **Reset** sets this window's settings to their defaults (language and window layout stay; kept only with OK).

## Keyboard shortcuts

| Keys | Action |
|---|---|
| Ctrl+N · Ctrl+O · Ctrl+S · Ctrl+Shift+S | New · open · save · save as |
| Ctrl+Z · Ctrl+Y | Undo · redo |
| Ctrl+1 … Ctrl+5 | Data · Model · Code · Train · Test |
| Delete · Ctrl+D · Ctrl+A | Delete · duplicate · select all (Model tab) |
| Ctrl+L · Ctrl+0 · Ctrl+E | Auto layout · fit · neuron view |
| Arrow keys (Shift: further) | Move the selected layers |
| F5 · F6 · F10 · Shift+F5 | Start · pause / resume · one batch · stop |
| F1 | User's guide |
| Ctrl+F · Ctrl+Space | Find in the code · completion |

## Troubleshooting

- **"The model has errors"** — see the state line above the model or the **Problems** tab. Most often the output layer has a different number of units than there are classes, or a picture layer (Conv2D) gets an input that is not a picture.
- **The PyTorch engine cannot be chosen** — the web version has no PyTorch engine; use the desktop app.
- **"No Python with PyTorch"** — press **Detect again** in the Python / PyTorch window, or enter a Python with PyTorch as the Python path in the settings.
- **Python ended with an error** — read the traceback in the console. Edited code can be reset with **Regenerate from the model**.
- **Training is slow** — check the engine backend in the status bar (cpu is slow). A larger batch size or a longer snapshot interval speeds it up.
