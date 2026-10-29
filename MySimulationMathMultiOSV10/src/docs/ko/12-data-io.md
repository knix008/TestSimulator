# 데이터 가져오기와 내보내기

## 데이터 가져오기 창

리본 **홈 › 데이터 가져오기** 나 **앱 › 데이터 가져오기** 는 파일을 고르게 한 뒤 형식에 맞는 명령을 명령 창에서 실행합니다(예: `data = readmatrix('measure.csv')`). 현재 폴더에서 데이터 파일을 두 번 클릭해도 같습니다. 실행한 명령이 그대로 보이므로 스크립트에 옮겨 쓰기 쉽습니다.

## MAT 파일 (작업 공간)

```m
x = rand(3); name = "test";
save('mydata.mat')            % 모든 변수
save('xonly.mat', 'x')        % x 만
clear
load('mydata.mat')
S = load('xonly.mat');        % 구조체로 받기
S.x
whos('-file', 'mydata.mat')
```

작업 공간 창에서 변수를 오른쪽 클릭 › **MAT 파일로 저장** 도 됩니다.

## 표 데이터 (CSV, 텍스트, 엑셀)

```m
T = table((1:3)', [2.5; 3.1; 4.8], 'VariableNames', {'id', 'value'});
writetable(T, 'table.csv');
T2 = readtable('table.csv')
M = magic(4);
writematrix(M, 'm.csv');
readmatrix('m.csv')
writetable(T, 'table.xlsx');
readtable('table.xlsx')
C = readcell('table.csv');
```

| 함수 | 내용 |
| --- | --- |
| `readmatrix`, `writematrix` | 숫자 행렬 |
| `readtable`, `writetable` | 머리글이 있는 표 (CSV, TXT, XLSX) |
| `readcell`, `writecell` | 섞인 자료 |
| `readlines`, `writelines`, `fileread` | 텍스트 줄 / 전체 |
| `csvread`, `csvwrite`, `dlmread`, `dlmwrite`, `xlsread` | 예전 방식 |
| `detectImportOptions`, `textscan` | 형식을 자세히 정해 읽기 |

## 저수준 파일 입출력

```m
fid = fopen('log.txt', 'w');
fprintf(fid, '%d,%f\n', [1:3; rand(1, 3)]);
fclose(fid);
fid = fopen('log.txt', 'r');
while true
    line = fgetl(fid);
    if ~ischar(line), break; end
    disp(line)
end
fclose(fid);
```

`fopen`, `fclose`, `fprintf`, `fscanf`, `fgetl`, `fgets`, `fread`, `fwrite`, `fseek`, `ftell`, `feof` 를 지원합니다.

## JSON, XML, 구조체

```m
s = struct('name', "pump", 'rpm', 1450, 'tags', {{"a", "b"}});
txt = jsonencode(s)
back = jsondecode(txt);
writestruct(s, 'pump.xml');
readstruct('pump.xml')
```

## 그림과 소리

```m
img = imread('photo.png');        % H×W×3 uint8
gray = rgb2gray(img);
imwrite(gray, 'gray.png');
imshow(gray)
[y, fs] = audioread('sound.wav');
sound(y, fs)                      % 재생
audiowrite('out.wav', y, fs);
```

그림은 PNG, JPEG, BMP, GIF, TIFF, PNM 을, 소리는 WAV 를 읽고 씁니다.

## 압축 파일과 웹

`zip`, `unzip`, `tar`, `untar`, `gzip`, `gunzip` 으로 압축하고, `webread`, `webwrite`, `websave` 로 웹에서 데이터를 받습니다.

## 파일과 폴더

`dir`, `ls`, `exist`, `isfile`, `isfolder`, `mkdir`, `rmdir`, `delete`, `copyfile`, `movefile`, `fullfile`, `fileparts`, `tempdir`, `tempname` 을 씁니다.

> 참고: 웹 판에서는 모든 파일 경로가 서버의 작업 폴더 안으로 제한됩니다.
