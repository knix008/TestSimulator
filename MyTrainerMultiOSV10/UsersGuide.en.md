# MyTrainer User's Guide

MyTrainer lets you **draw** neural networks, prepare data, train them and **watch what every layer and neuron does**. A trained model can be tried straight away — draw a picture, click a point, type values — and the same model is available as **PyTorch code** that you can edit and run with PyTorch.

- The same app runs in a web browser and on Windows, macOS and Linux (Tauri 2).
- Two training engines: **TensorFlow** inside the app (TensorFlow.js — WebGPU · WebGL · CPU), and **PyTorch** through this computer's Python (desktop app).
- **54 sample models**, all with data generated offline: perceptron, MLP, polynomial regression, **comparisons** (activation functions, overfitting and regularization, vanishing gradients, RNN · GRU · LSTM), CNN architectures (**VGG · Inception · DenseNet · MobileNet**), autoencoders (**denoising · anomaly detection** too), RNN · LSTM · GRU, Conv1D, **CNN + LSTM**, **transformers** (sentiment, forecasting, mini GPT), residual connections, wide & deep, speech (embedded DS-CNN · BC-ResNet, **two Korean keyword sets** and the live-ready **BC-ResNet+**), pictures, letters (OCR), video and tables (CSV).
- New here? The **welcome window** at start offers the **tutorial** (19 steps pointing at the screen) and the **tutorial video**.

![Start page](docs/images/start.png)

## Quick start

0. New to MyTrainer? **Start the tutorial** (welcome window, top of the start page, or **Help › Start the tutorial**) walks through the steps below on the screen with you.
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

- **Built-in datasets** — 2-D points (XOR, circles, moons, spiral, blobs, checkerboard), functions and tables (line, sine, Friedman), pictures (digits 0–9, shapes, coloured shapes, objects, **noisy digits** for denoising — the input is a digit under noise with blocks wiped out, the target the clean digit — and **digits + odd pictures** for anomaly detection — inverted digits, smudges and grids mixed in at a share you set), letters (English A–Z, Hangul consonants), **speech commands** (formant synthesis, mel spectrogram), **video** (clips of moving objects), sequences (sine forecasting, patterns, counting ones, motion sensor) and text (short sentence sentiment, **English and Korean sentences for character-level language models**). Change the sample count, noise, seed … and the data is generated again at once.
- **Recorded speech (real data)** — **Korean keywords: 출근 · 퇴근 · 경비 · 해제** (clock in · clock out · arm · disarm). 5520 clips (3840 keywords + 1680 unknown) from 120 Supertonic TTS voices (the built-in 5 male and 5 female, 30 blends of two and 80 nudged mixes of three) as a statement, a command and a question at several speeds, plus about 120 similar-sounding and everyday words (unknown: 출발 · 퇴장 · 경보 · 해지 …). **Augmented copies** (speed and pitch, time shift, gain, microphone colour, room echo, background noise, people talking behind, VTLP, SpecAugment) and a **background noise class** can be added. Making the spectrograms of all copies takes a while the first time; a progress window shows how far it is. **Korean keywords: 출근 · 퇴근 · 외출 · 복귀** (clock in · clock out · going out · back) is made the same way (5520 clips); its unknown words add look-alikes of the new keywords such as 외식, 외부, 복구, 복지, 귀가, 경비, 해제 (about 150).
- **Import CSV** — comma, semicolon and tab are detected. Pick the target column: text or few distinct values make it **classification**, otherwise **regression**. Text feature columns become one-hot columns; missing numbers get the column mean. Try `samples/student-pass.csv` (pass / fail, classification) and `samples/house-prices.csv` (regression).
- **Import a picture folder** — sub-folder names are the classes (`cats/`, `dogs/` …). PNG · JPEG · GIF · WebP · BMP · AVIF · ICO · SVG · **TIFF · TGA** are read.
- **Import a sound folder** — sub-folder names are the classes. WAV · MP3 · OGG · FLAC · M4A · WebM are read; the loudest second is kept at 8 kHz.

The `data/` folder has ready examples: CSV (`csv/`), pictures (`images/`), sounds (`audio/speech/`, `audio/kws-ko/`, `audio/kws-ko-attend/`) and files to predict (`predict/`). See `data/README.md`.

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

Validation and test percentages, the shuffle seed and **keep class proportions** (stratified). Speech data also has **split by speaker (recording)** (on by default): a speaker's clips (or a recording and its augmented copies) go to only one of training, validation and test, so validation and test accuracy is the accuracy on voices the model has never heard. The bar below shows the three parts.

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
| Tidy up | **Auto layout** (Ctrl+L), **fit** (Ctrl+0, centred), zoom (− [percent] + buttons, Ctrl+wheel, Ctrl+= / Ctrl+-) |
| Direction · grid | **Top → bottom / Left → right**: the same layout shown vertically or horizontally (the arrangement is kept). **Grid** (Ctrl+G): a 5×5 grid with a darker line every five cells, on or off. |
| Select | Click, Shift+click, Shift+drag (rectangle), Ctrl+A |

Shapes are computed from the data to the output; a mismatch marks the card in red with an explanation (e.g. "Needs a picture input (height, width, channels)", "The output shape (3) differs from the (4) the data wants"). The state line above the model and the **Problems** tab list everything; clicking a problem goes to its layer. When the data changes, the output layer's units and activation follow the task.

### Neuron view

![Neuron view](docs/images/neuron-view.png)

At first the whole network **fits the window's width**; the toolbar's − [percent] + buttons (or Ctrl+wheel, Ctrl+= / Ctrl+-) zoom, the fit button (Ctrl+0) fits the width again. Smaller than the window it is centred, bigger it scrolls.

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
| Engine | Chosen with the toolbar's **TensorFlow / PyTorch** buttons: TensorFlow is TensorFlow.js in the app, PyTorch trains through Python on the desktop. |
| Device | **Training works without a GPU.** TensorFlow: auto (WebGPU → WebGL → **CPU — WASM** → CPU — JavaScript) or pick one; WASM is fast CPU training with SIMD (small models even beat the GPU). PyTorch: auto (CUDA · MPS) or CPU. |
| Optimizer | Adam, SGD, SGD + momentum, RMSprop, Adagrad, Adadelta, Adamax |
| Learning rate · schedule | Constant, step decay, exponential decay, cosine |
| Loss | Automatic (classification: cross-entropy; regression and reconstruction: MSE), MAE, Huber |
| Weight decay · early stopping · patience | Less overfitting |
| Snapshot every | How often (epochs) every layer's activations, weights and gradients are fetched |
| Label smoothing · mixup (α) (advanced) | Targets of (1−ε) instead of 100 % / training on blends λ : 1−λ of two samples and their targets (λ ~ Beta(α, α)); both classification only. Mixup makes a model steadier on data it has not seen; the Korean keyword sample uses 0.3 |

**Start (F5) · pause / resume (F6) · one batch (F10) · stop (Shift+F5) · reset**. **Start** always starts afresh (new random weights; the earlier history, results and evaluation cleared). After a TensorFlow run, **Continue** trains more epochs on top of its weights. When preparing the data and the model and the first epoch take a while, a **progress window** shows how far it is; it also appears while a large dataset such as the sound clips is made for the first time. When training has finished (not when you stopped it), a **popup** shows the epochs, the time, the loss and the accuracy (Settings › General can turn it off). An **error** opens a popup with the message, where, when, version, engine and stack; **Copy the details** copies it all.

When training has finished, the left panel shows the **training summary** (epochs and time, the last loss and accuracy, the best validation epoch, the test accuracy and F1, the parameters, the device).

The Train tab's **neuron activity** card: every output neuron at the end carries its **class label and value** (probabilities in %), the largest one highlighted. ◀ Input n / N ▶ 🎲 change the input going through the network (a training sample — at once, also while training); with **change every epoch** another sample goes through at every epoch. − [percent] + and **Reset view** zoom; drag to move.

Every chart card has a title; hover over it (ⓘ) to see what the card shows (the Data and Test tabs work the same way). For classification, the **output probabilities** card shows each class's probability (e.g. 경비 · 출근 · 퇴근 · 해제) for the probe input under the current model; the bar in bold text is the true class. At the top, the probe input's **neuron activity** shows it passing through the network while you train. Below it the charts: loss (train / validation; earlier runs dashed), accuracy or learning rate, the **decision boundary** (2-D points) · **fitted curve** (1-D functions) · **original / reconstructed** (autoencoders) · output probabilities, **gradient flow** (mean |∇W| per layer — small red bars in the early layers mean vanishing gradients) and the **weight distribution per layer**.

## Test tab

![Test tab](docs/images/test.png)

- **Test sample**: previous / next / random; after an evaluation, **mistakes only**.
- **Choose the input**: **Test sample** · **My file** (open picture, sound, CSV or text files or a folder and run them) · **Examples** (example inputs that come with the app, not used for training: one click runs one, **Run all** runs them all) · your own input. The input goes through the network and the prediction shows below.
- **Microphone** (speech models): press **Say a word** and say one word within 4 s; when it is over (a moment of quiet) the whole word, centred like the training data, is predicted. **Keep listening** predicts each word as soon as it is over (never half a word).
- **Your own input**: **draw** pictures in the black square, **click** the plane for 2-D points, **type** a sentence (click known words to add them), or type values in their original units for tables and functions (the preprocessing is applied for you).
- The input passing through the network is shown as a large neuron view, with the prediction (class probabilities · value · reconstruction).
- **Performance (inference time)**: **Measure** puts test inputs through one at a time, 20 · 50 · 100 · 200 times: **mean ± standard deviation**, min … max, median, p95, and the **throughput** (inputs/s) of up to 256 inputs at once — from asking the engine to having the answer (what the app really waits).
- **Evaluation** (automatic after training): accuracy, macro F1, loss, per-class precision · recall · F1, the **confusion matrix** (click a cell to list only those mistakes), pictures of the mistakes (click one to use it as input). Regression: MAE · RMSE · R², predicted vs actual and the error distribution.
- **Worst reconstructions** (autoencoders): up to 24 test pictures with the largest reconstruction error (mean squared), each input above its reconstruction. An autoencoder rebuilds the common pictures well, so the top ones are the **anomaly candidates**; when the data flags anomalies (digits + odd pictures) the real ones get a **●**, so you see how well the detection worked. Click one to use it as the input.

After training, the PyTorch engine keeps its run alive (`mt.serve`) to answer test requests; **End PyTorch** ends it.

## Printing · the results report

The toolbar's **Print** button, **File › Print…** (Ctrl+P) and **File › Save the results report…** open the report window: pick the **paper** (A4 · Letter · A3), the **orientation**, the **margins** and the **contents** (overview · model · training settings · training summary · test evaluation · results on the chosen inputs · performance) on the left; the **preview** on the right shows the pages.

- **Print…** prints those pages (a PDF printer works too).
- **Save…** saves them in the chosen format, the pictures (loss and accuracy charts, confusion matrix) included:

| Format | Saved |
|---|---|
| **PDF** | one PDF with the pages of the preview |
| **Word (.docx)** | a Word document with the tables and pictures, ready to edit |
| **Markdown** | `report.md` + `images/*.png` (desktop: a folder, web: a ZIP) |
| **CSV** | `report.csv` (tables and values, opens in Excel) + `images/*.png` |

## Exporting the model

The toolbar's **Export** button (or **File › Export the model…**) opens a choice of formats; the trained weights go with the model (desktop: a `<name>-onnx` / `<name>-tfjs` / `<name>-c` folder under the folder you pick, web: a ZIP download).

| Format | Files | Where it runs |
|---|---|---|
| **ONNX** | `model.onnx` (opset 13, the preprocessing inside — the input is the raw values), `model.json` (shapes, class names, a test sample), `README.md` | ONNX Runtime: C, C++, C#, Java, Python, JavaScript, mobile |
| **TensorFlow.js** | `model.json` + `weights.bin` (a Keras-style layers model), `mytrainer.json` (class names, input shape, preprocessing steps), `README.md` | `tf.loadLayersModel` in the browser or Node; `tensorflowjs_converter` turns it into Keras (.h5) or a SavedModel. Models trained with the TensorFlow engine |
| **C/C++** | `model.h`, `model.c` (weights as `const float` arrays, no library, no dynamic memory), a self-checking `example.c`, `README.md` | Any C or C++ program, microcontrollers |
| **PyTorch code** | the model and training script (`.py`), no weights | PyTorch |

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
| Classification basics | XOR, circles, polynomial features + logistic regression, two moons, spiral (3 classes), softmax regression, checkerboard + batch norm, **perceptron (a single neuron)**, **activation functions compared**, **overfitting and regularization**, **vanishing gradients in deep networks** |
| Regression | Linear regression, sine curve fitting, tabular regression (Friedman), **polynomial regression** |
| Tables (CSV) | Student pass prediction, house prices |
| Pictures (CNN) | Digits (MLP), digits (CNN), shapes (CNN + BN + augmentation), coloured shapes (RGB CNN), objects (CNN), **VGG-style CNN**, **Inception blocks**, **DenseNet-style CNN**, **MobileNet-style CNN** |
| Letters (OCR) | English capitals, Hangul consonants |
| Speech | Speech commands (CNN · GRU), **keyword spotting DS-CNN · BC-ResNet (embedded)**, **Korean keyword spotting: 출근 · 퇴근 · 경비 · 해제** (Supertonic voices; ResNet CNN / DS-CNN / BC-ResNet), **Korean keyword spotting: 출근 · 퇴근 · 외출 · 복귀** (BC-ResNet+ by default — about 20 thousand parameters, for live use; compare with ResNet CNN / DS-CNN / BC-ResNet) |
| Video | Action recognition (frames + LSTM, stacked-frame CNN) |
| Language models (LLM) | **Mini GPT** (English · Korean, character-level transformer), LSTM language model |
| Autoencoders | Autoencoder, convolutional autoencoder, **denoising autoencoder**, **anomaly detection (autoencoder)** |
| Sequences · text | Forecasting (LSTM), pattern classification (GRU), counting ones (RNN), activity recognition (Conv1D), sentiment (embedding + LSTM), **sentiment (transformer)**, **forecasting (transformer)**, **activity recognition (CNN + LSTM)**, **RNN, GRU and LSTM compared** |
| Graph structures | Residual connection (ResNet block), wide & deep (concatenate) |

Open them from **File › Sample models…** (the gallery) or the start page. The `samples/` folder has `.mytrain` files of some samples and the CSV examples.

### Comparing models

A sample with several models lets you pick one under **Model** at the top of the **Train** tab (edits are kept per model). Same data, same training settings, only the architecture changes — compare the loss curves and the results.

| Sample | Models | What you see |
|---|---|---|
| Activation functions compared (spiral) | ReLU · tanh · sigmoid · GELU | sigmoid hardly learns (about 58% test accuracy), tanh is slow, ReLU and GELU reach about 99% fast |
| Overfitting and regularization (moons, 120 points) | big network · dropout · small network | the big network's validation loss rises again (overfitting); dropout and the small network draw a smooth boundary |
| Vanishing gradients (8 layers) | 8 sigmoid layers · ReLU + batch norm · residual connections | 8 sigmoid layers stay at chance (33%), residual connections reach 99% — see the per-layer sizes in the Train tab's **gradient flow** |
| RNN, GRU and LSTM compared (90-step signals) | LSTM · GRU · simple RNN | the signals are long: the gateless RNN forgets their beginning (about 50%), GRU and LSTM reach 100% |
| Korean keyword spotting (both samples) | ResNet CNN · DS-CNN · BC-ResNet (· BC-ResNet+) | the table below |

**BC-ResNet+**, the default model of **Korean keyword spotting: 출근 · 퇴근 · 외출 · 복귀** (clock in, clock out, going out, back), stacks ten BC-ResNet blocks in four stages, a 1×1 convolution widening the channels 16 → 24 → 32 → 40 at each (halving the size midway keeps the work low). Tested on 3605 clips of voices it never heard (PyTorch, 20 epochs):

| Model | Parameters | MACs | 4-keyword accuracy | 출근 · 퇴근 · 외출 · 복귀 |
|---|---|---|---|---|
| **BC-ResNet+** (default) | 21 k | 0.97 M | **95.9%** | 95.6 · 96.4 · 96.4 · 95.0 |
| DS-CNN | 23 k | 5.4 M | 95.7% | 94.2 · 96.6 · 96.1 · 96.1 |
| BC-ResNet | 4.7 k | 0.58 M | 92.0% | 91.9 · 91.3 · 93.1 · 91.9 |
| ResNet CNN | 127 k | 24.7 M | 97.1% | 95.3 · 99.4 · 97.3 · 96.4 |

BC-ResNet+ decides on one second of speech in about 1.8 ms with the app's engine (TensorFlow.js WASM) — plenty for live microphone use — and matches DS-CNN with 1/5.6 of its work. It learned from synthetic voices: check real ones with the microphone in the Test tab.

## Files

- **Projects (.mytrain)** are JSON files with the data recipe (source, preprocessing, split), the model graph, the training settings, the engine, the PyTorch code (when edited), past runs and — depending on the settings — the **trained weights** (TensorFlow.js). CSV and picture data are stored inside, so a project opens anywhere.
- On the desktop, double-clicking a `.mytrain` file opens it in MyTrainer.
- Unsaved work is remembered: **Continue** on the start page opens it again.

## Start page

Along the top: **Start the tutorial**, the tutorial document and video, the **user's guide** and the sample gallery. Below: the sample gallery, recent files and **twenty AI-themed moving backgrounds** (neural signals, gradient descent, attention, convolution, embedding space, tensors, activation functions, backpropagation, decision boundary, loss curves, dropout, token stream, diffusion, k-means, decision tree, firing neurons, weight matrix, latent space, recurrent network, GAN distributions). Pick one or a random one, set the speed and how often it changes. **Home** on the menu bar brings the page back.

## Welcome window

At start the **welcome window** opens: **Start the tutorial**, **Tutorial document**, **Tutorial video**, **User's guide**, **Sample gallery** or **Empty project** — one click opens it. Untick **Show the welcome window at start** and it stays away from then on (saved at once); **Edit › Settings › General** has the same switch, and **Help › Welcome window** opens it any time.

## Tutorial

**Help › Start the tutorial** (or **Start the tutorial** on the start page or in the welcome window) goes with you through 19 steps in 7 chapters: it opens a sample, shows its data and model, trains it, and visits the neurons, the test, the code, comparing models and export. Each step outlines its part of the window and puts a card beside it: **Next / Back** (or → / ←, Enter) and **Close** (Esc). The tutorial opens samples of its own, so unsaved work is offered for saving first. **Help › Tutorial document** has the same steps with pictures; **Help › Tutorial video** shows them as a (silent) video.

## The user's guide window

The user's guide (F1) and the tutorial document open in a window of their own. Its top bar switches the **document** (user's guide · tutorial) and the **language** (한국어 · English), sets the **text size** (A− · A+ · ↺ reset, or Ctrl − / Ctrl + / Ctrl 0) and the **font** (default · serif · monospace); size and font stay for the next time. The window's colours and title bar **follow the app's theme**, also when the theme changes while it is open.

## Settings

**Edit › Settings…** (a window of one fixed size, four tabs): **General** (language, welcome window, start page, ask to save on exit, save weights, a popup when training has finished · visualization: colour map, neurons shown per layer, signal animation · PyTorch: Python path, build to install) / **Theme** (20 light · 20 dark · system) / **Custom theme** (background, surface, text, accent colours, dark or not, start from a theme, preview) / **Font · code** (font, size, weight, style · code font size, wrapping, visualization hooks). Changes (theme, font, language …) **apply to the main window at once**. **OK** keeps them, **Cancel** (or ×, Esc) puts back the settings the window opened with, and **Reset** sets this window's settings to their defaults (language and window layout stay; kept only with OK).

## Keyboard shortcuts

| Keys | Action |
|---|---|
| Ctrl+N · Ctrl+O · Ctrl+S · Ctrl+Shift+S | New · open · save · save as |
| Ctrl+P | Print · results report |
| Ctrl+Z · Ctrl+Y | Undo · redo |
| Ctrl+1 … Ctrl+6 | Data · Model · Neurons · Code · Train · Test |
| Delete · Ctrl+D · Ctrl+A | Delete · duplicate · select all (Model tab) |
| Ctrl+L · Ctrl+0 · Ctrl+E | Auto layout · fit · neuron view |
| Ctrl+= · Ctrl+- · Ctrl+G | Zoom in · out (model and neuron view) · grid on/off |
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
