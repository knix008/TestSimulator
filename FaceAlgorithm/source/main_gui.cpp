#include <QApplication>
#include <QMainWindow>
#include <QVBoxLayout>
#include <QHBoxLayout>
#include <QPushButton>
#include <QLabel>
#include <QLineEdit>
#include <QTextEdit>
#include <QFileDialog>
#include <QMessageBox>
#include <QGroupBox>
#include <QProgressBar>
#include <QComboBox>
#include <QSpinBox>
#include <QCheckBox>
#include <QTabWidget>
#include <QTableWidget>
#include <QHeaderView>
#include <QImage>
#include <QPixmap>
#include <QScrollArea>
#include <QFrame>
#include <QSplitter>
#include <QStatusBar>
#include <QMenuBar>
#include <QAction>
#include <QMenu>
#include <QToolBar>
#include <QTimer>
#include <QThread>
#include <QMutex>
#include <QWaitCondition>
#include <QQueue>
#include <QDebug>

#include "opencv2/opencv.hpp"
#include "vaengine/vaengine.h"

class FaceRecognitionWorker : public QThread {
    Q_OBJECT

public:
    FaceRecognitionWorker(QObject *parent = nullptr) : QThread(parent) {}
    
    void setImagePath(const QString &path) {
        QMutexLocker locker(&mutex);
        imagePath = path;
    }
    
    void setGalleryPath(const QString &path) {
        QMutexLocker locker(&mutex);
        galleryPath = path;
    }

signals:
    void recognitionCompleted(const QString &result);
    void errorOccurred(const QString &error);
    void progressUpdated(int percentage);

protected:
    void run() override {
        try {
            emit progressUpdated(10);
            
            // Initialize engine
            FaceRecognitionEngine engine;
            if (!engine.Initialize()) {
                emit errorOccurred("Failed to initialize face recognition engine");
                return;
            }
            
            emit progressUpdated(30);
            
            // Load gallery
            QMutexLocker locker(&mutex);
            QString currentImagePath = imagePath;
            QString currentGalleryPath = galleryPath;
            locker.unlock();
            
            // Load gallery images
            std::vector<std::string> galleryFiles;
            QDir galleryDir(currentGalleryPath);
            QStringList filters;
            filters << "*.jpg" << "*.jpeg" << "*.png" << "*.bmp";
            QFileInfoList fileList = galleryDir.entryInfoList(filters, QDir::Files);
            
            for (const QFileInfo &fileInfo : fileList) {
                galleryFiles.push_back(fileInfo.absoluteFilePath().toStdString());
            }
            
            emit progressUpdated(50);
            
            // Process query image
            cv::Mat queryImage = cv::imread(currentImagePath.toStdString());
            if (queryImage.empty()) {
                emit errorOccurred("Failed to load query image");
                return;
            }
            
            emit progressUpdated(70);
            
            // Perform recognition
            FaceRecognitionEngine::RecognitionResult result = 
                engine.Identify(queryImage.data, queryImage.cols, queryImage.rows);
            
            emit progressUpdated(90);
            
            // Format result
            QString resultText = QString("Recognition Result:\n")
                .append(QString("ID: %1\n").arg(result.id))
                .append(QString("Score: %1\n").arg(result.score, 0, 'f', 4))
                .append(QString("Result Code: %1\n").arg(result.rcode))
                .append(QString("Face Position: (%1, %2, %3, %4)")
                    .arg(result.x).arg(result.y).arg(result.w).arg(result.h));
            
            emit progressUpdated(100);
            emit recognitionCompleted(resultText);
            
        } catch (const std::exception &e) {
            emit errorOccurred(QString("Exception: %1").arg(e.what()));
        }
    }

private:
    QMutex mutex;
    QString imagePath;
    QString galleryPath;
};

class FaceRecognitionGUI : public QMainWindow {
    Q_OBJECT

public:
    FaceRecognitionGUI(QWidget *parent = nullptr) : QMainWindow(parent) {
        setupUI();
        setupConnections();
        setupMenuBar();
        setupStatusBar();
    }

private slots:
    void selectQueryImage() {
        QString fileName = QFileDialog::getOpenFileName(
            this, "Select Query Image", "", 
            "Image Files (*.png *.jpg *.jpeg *.bmp)"
        );
        if (!fileName.isEmpty()) {
            queryImagePath->setText(fileName);
            displayImage(fileName, queryImageLabel);
        }
    }
    
    void selectGalleryDirectory() {
        QString dirName = QFileDialog::getExistingDirectory(
            this, "Select Gallery Directory"
        );
        if (!dirName.isEmpty()) {
            galleryPath->setText(dirName);
        }
    }
    
    void startRecognition() {
        if (queryImagePath->text().isEmpty()) {
            QMessageBox::warning(this, "Warning", "Please select a query image");
            return;
        }
        
        if (galleryPath->text().isEmpty()) {
            QMessageBox::warning(this, "Warning", "Please select a gallery directory");
            return;
        }
        
        // Disable controls during processing
        recognizeButton->setEnabled(false);
        progressBar->setVisible(true);
        progressBar->setValue(0);
        
        // Start recognition worker
        worker->setImagePath(queryImagePath->text());
        worker->setGalleryPath(galleryPath->text());
        worker->start();
    }
    
    void onRecognitionCompleted(const QString &result) {
        resultText->setPlainText(result);
        recognizeButton->setEnabled(true);
        progressBar->setVisible(false);
        statusBar()->showMessage("Recognition completed", 3000);
    }
    
    void onErrorOccurred(const QString &error) {
        QMessageBox::critical(this, "Error", error);
        recognizeButton->setEnabled(true);
        progressBar->setVisible(false);
        statusBar()->showMessage("Error occurred", 3000);
    }
    
    void onProgressUpdated(int percentage) {
        progressBar->setValue(percentage);
    }
    
    void displayImage(const QString &imagePath, QLabel *label) {
        QPixmap pixmap(imagePath);
        if (!pixmap.isNull()) {
            QPixmap scaledPixmap = pixmap.scaled(
                label->size(), Qt::KeepAspectRatio, Qt::SmoothTransformation
            );
            label->setPixmap(scaledPixmap);
        }
    }
    
    void about() {
        QMessageBox::about(this, "About Face Recognition GUI",
            "Face Recognition GUI v1.0\n\n"
            "A graphical interface for the Face Recognition Engine.\n"
            "Built with Qt and OpenCV."
        );
    }

private:
    void setupUI() {
        setWindowTitle("Face Recognition GUI");
        setMinimumSize(1000, 700);
        
        // Central widget
        QWidget *centralWidget = new QWidget;
        setCentralWidget(centralWidget);
        
        // Main layout
        QHBoxLayout *mainLayout = new QHBoxLayout(centralWidget);
        
        // Left panel - Controls
        QGroupBox *controlGroup = new QGroupBox("Controls");
        QVBoxLayout *controlLayout = new QVBoxLayout(controlGroup);
        
        // Query image selection
        QHBoxLayout *queryLayout = new QHBoxLayout;
        queryLayout->addWidget(new QLabel("Query Image:"));
        queryImagePath = new QLineEdit;
        queryImagePath->setReadOnly(true);
        queryLayout->addWidget(queryImagePath);
        QPushButton *selectQueryBtn = new QPushButton("Browse");
        connect(selectQueryBtn, &QPushButton::clicked, this, &FaceRecognitionGUI::selectQueryImage);
        queryLayout->addWidget(selectQueryBtn);
        controlLayout->addLayout(queryLayout);
        
        // Gallery directory selection
        QHBoxLayout *galleryLayout = new QHBoxLayout;
        galleryLayout->addWidget(new QLabel("Gallery Directory:"));
        galleryPath = new QLineEdit;
        galleryPath->setReadOnly(true);
        galleryLayout->addWidget(galleryPath);
        QPushButton *selectGalleryBtn = new QPushButton("Browse");
        connect(selectGalleryBtn, &QPushButton::clicked, this, &FaceRecognitionGUI::selectGalleryDirectory);
        galleryLayout->addWidget(selectGalleryBtn);
        controlLayout->addLayout(galleryLayout);
        
        // Recognition button
        recognizeButton = new QPushButton("Start Recognition");
        recognizeButton->setStyleSheet("QPushButton { background-color: #4CAF50; color: white; font-weight: bold; padding: 10px; }");
        connect(recognizeButton, &QPushButton::clicked, this, &FaceRecognitionGUI::startRecognition);
        controlLayout->addWidget(recognizeButton);
        
        // Progress bar
        progressBar = new QProgressBar;
        progressBar->setVisible(false);
        controlLayout->addWidget(progressBar);
        
        controlLayout->addStretch();
        
        // Right panel - Results
        QGroupBox *resultGroup = new QGroupBox("Results");
        QVBoxLayout *resultLayout = new QVBoxLayout(resultGroup);
        
        // Image display
        QLabel *imageLabel = new QLabel("Query Image");
        imageLabel->setAlignment(Qt::AlignCenter);
        imageLabel->setStyleSheet("border: 1px solid gray; background-color: #f0f0f0;");
        imageLabel->setMinimumHeight(200);
        queryImageLabel = imageLabel;
        resultLayout->addWidget(imageLabel);
        
        // Result text
        resultText = new QTextEdit;
        resultText->setReadOnly(true);
        resultText->setMaximumHeight(150);
        resultLayout->addWidget(new QLabel("Recognition Result:"));
        resultLayout->addWidget(resultText);
        
        // Add to main layout
        mainLayout->addWidget(controlGroup, 1);
        mainLayout->addWidget(resultGroup, 2);
    }
    
    void setupConnections() {
        worker = new FaceRecognitionWorker(this);
        connect(worker, &FaceRecognitionWorker::recognitionCompleted,
                this, &FaceRecognitionGUI::onRecognitionCompleted);
        connect(worker, &FaceRecognitionWorker::errorOccurred,
                this, &FaceRecognitionGUI::onErrorOccurred);
        connect(worker, &FaceRecognitionWorker::progressUpdated,
                this, &FaceRecognitionGUI::onProgressUpdated);
    }
    
    void setupMenuBar() {
        QMenuBar *menuBar = this->menuBar();
        
        // File menu
        QMenu *fileMenu = menuBar->addMenu("&File");
        QAction *exitAction = fileMenu->addAction("&Exit");
        connect(exitAction, &QAction::triggered, this, &QWidget::close);
        
        // Help menu
        QMenu *helpMenu = menuBar->addMenu("&Help");
        QAction *aboutAction = helpMenu->addAction("&About");
        connect(aboutAction, &QAction::triggered, this, &FaceRecognitionGUI::about);
    }
    
    void setupStatusBar() {
        statusBar()->showMessage("Ready");
    }

private:
    QLineEdit *queryImagePath;
    QLineEdit *galleryPath;
    QPushButton *recognizeButton;
    QProgressBar *progressBar;
    QLabel *queryImageLabel;
    QTextEdit *resultText;
    FaceRecognitionWorker *worker;
};

int main(int argc, char *argv[]) {
    QApplication app(argc, argv);
    
    FaceRecognitionGUI window;
    window.show();
    
    return app.exec();
}

#include "main_gui.moc"
