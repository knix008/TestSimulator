# MyTrainer Tutorial

This tutorial walks through MyTrainer on the real screen: opening a sample, its data and model, training it live, looking at the neurons, testing, the generated PyTorch code, comparing models and exporting. The same steps run inside the program — **Help › Start the tutorial** (or **Start the tutorial** on the start page or in the welcome window) outlines each part of the window with a card beside it: Next / Back, or → / ← and Esc. **Help › Tutorial video** shows it as a video.

## Contents

1. Getting started
2. Drawing a model
3. Data
4. Training
5. Looking inside
6. Comparing models
7. Export and help

## 1. Getting started

### 1. Welcome to MyTrainer

![Welcome to MyTrainer](docs/images/tutorial/en/01-welcome.jpg)

Draw a neural network, prepare its data, train it and watch what every layer and neuron does. This tutorial opens a sample, trains it and looks at the results with you. Go on with [Next] or →, close it any time with Esc.

### 2. Sample models

![Sample models](docs/images/tutorial/en/02-samples.jpg)

The samples are grouped by field on the right of the start screen: basics, regression, images (CNN), speech, sequences, transformers, autoencoders and more. A click opens a project with its data, model and training settings; all the data is generated, so it works offline.

### 3. Opening a sample: two moons

![Opening a sample: two moons](docs/images/tutorial/en/03-openSample.jpg)

"Two moons" is open. The tabs along the top follow the work: Data → Model → Neurons → Code → Train → Test. Ctrl+1 … Ctrl+6 switch between them too.

## 2. Drawing a model

### 4. The model graph

![The model graph](docs/images/tutorial/en/04-graph.jpg)

Layers are cards and the data paths are lines. Each card shows the layer type, its output shape and its parameter count; a number such as (32) on a line is the shape of the tensor flowing there. When shapes do not fit, the card turns red and the problem list says why.

### 5. The layer palette

![The layer palette](docs/images/tutorial/en/05-palette.jpg)

Drag a layer from the palette onto the graph, or onto a line to insert it there. There are 27 kinds — dense, convolutions, depthwise convolutions, recurrent layers (RNN, LSTM, GRU), self-attention, normalization, add, concatenate and more — and the search box finds them by their PyTorch names (nn.Conv2d …) too.

### 6. Properties

![Properties](docs/images/tutorial/en/06-inspector.jpg)

Pick a layer to change its values — units, activation, kernel size — in the Properties panel on the right. With nothing picked it shows the model summary (layers, parameters, input and output, task) and the problems.

### 7. Console, summary and problems

![Console, summary and problems](docs/images/tutorial/en/07-console.jpg)

The bottom panel has tabs for the console (what happened), a per-layer model summary table and the problem list. While training, the console logs the loss and accuracy of every epoch.

## 3. Data

### 8. The Data tab

![The Data tab](docs/images/tutorial/en/08-data.jpg)

Choose where the data comes from (a generator, a CSV file, a picture or sound folder), its options, the preprocessing steps (standardize, polynomial features, noise, flips …) and the train / validation / test split, and look at the samples. The moons data is 400 points in two interlocking half-moons — no straight line separates them.

## 4. Training

### 9. Training settings

![Training settings](docs/images/tutorial/en/09-trainTab.jpg)

On the left of the Train tab set the engine and device, then the optimizer, learning rate, epochs, batch size, loss and learning-rate schedule. The advanced settings add label smoothing, mixup, weight decay and early stopping.

### 10. Two engines: TensorFlow and PyTorch

![Two engines: TensorFlow and PyTorch](docs/images/tutorial/en/10-engine.jpg)

Pick the engine on the toolbar. TensorFlow (TensorFlow.js) trains right inside the app on WebGPU, WebGL or the CPU; PyTorch runs the PyTorch code made from the model with this computer's Python. Both draw their results on the same screens.

### 11. Start training

![Start training](docs/images/tutorial/en/11-startTraining.jpg)

Press ▶ Start training (F5). Pause (F6), one batch at a time (F10), stop and reset are here and on the toolbar.

### 12. Live charts

![Live charts](docs/images/tutorial/en/12-liveCharts.jpg)

Every epoch updates the loss and accuracy curves (training and validation), the decision boundary, the gradient flow per layer and one probe input travelling through the network. A validation curve that turns up again means overfitting.

## 5. Looking inside

### 13. Neurons

![Neurons](docs/images/tutorial/en/13-neurons.jpg)

See each layer's activations and weights in colour. Click a neuron to see how its value was computed — weighted sum + bias → activation — with the real numbers. Convolutions show feature maps, LSTMs their gates, attention its weight table.

### 14. Test

![Test](docs/images/tutorial/en/14-test.jpg)

After training the model is evaluated on the test data: accuracy, precision / recall / F1 per class, the confusion matrix and the mistakes. Click a sample to use it as the input, or draw your own, pick files or use the microphone or webcam.

### 15. PyTorch code

![PyTorch code](docs/images/tutorial/en/15-code.jpg)

A readable PyTorch script made from the model and its training settings. Edit it and run it with the PyTorch engine; it has syntax colours, completion and explanations on hover.

## 6. Comparing models

### 16. Choosing a model

![Choosing a model](docs/images/tutorial/en/16-variants.jpg)

Samples with several models, such as "Activation functions compared", let you pick the model at the top of the Train tab. Train sigmoid, tanh, ReLU and GELU in turn and compare their curves. Overfitting and regularization, vanishing gradients, RNN / GRU / LSTM and Korean keyword spotting compare the same way.

## 7. Export and help

### 17. Saving and export

![Saving and export](docs/images/tutorial/en/17-export.jpg)

A project is one .mytrain file with the data settings, the model and the trained weights. Export a trained model to ONNX, TensorFlow.js, C source (microcontrollers) or a PyTorch script, and save or print a training report as PDF.

### 18. Settings and themes

![Settings and themes](docs/images/tutorial/en/18-settings.jpg)

Settings change the language, the theme (light, dark or your own), fonts, the visualizations and the Python path. The welcome window at start is switched on and off here too.

### 19. Help

![Help](docs/images/tutorial/en/19-help.jpg)

The Help menu has the user's guide (F1), this tutorial with its document and video, the welcome window and the shortcuts. The guide window changes language, text size and font along its top and follows the app's theme. Now open another sample!

---

See the [user's guide](UsersGuide.en.md) for every feature in detail.

© SHKWON (knix008@naver.com)
