# Importing and Exporting Data

## Import Data Window

**Home › Import Data** or **Apps › Import Data** on the ribbon lets you choose a file, then runs the command that matches its format in the Command Window (for example `data = readmatrix('measure.csv')`). Double-clicking a data file in Current Folder does the same. Because the command that was run is shown as is, it is easy to copy into a script.

## MAT Files (Workspace)

```m
x = rand(3); name = "test";
save('mydata.mat')            % all variables
save('xonly.mat', 'x')        % x only
clear
load('mydata.mat')
S = load('xonly.mat');        % receive as a struct
S.x
whos('-file', 'mydata.mat')
```

You can also right-click a variable in the Workspace window › **Save as MAT file**.

## Tabular Data (CSV, Text, Excel)

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

| Function | Contents |
| --- | --- |
| `readmatrix`, `writematrix` | Numeric matrices |
| `readtable`, `writetable` | Tables with headers (CSV, TXT, XLSX) |
| `readcell`, `writecell` | Mixed data |
| `readlines`, `writelines`, `fileread` | Text by line / whole file |
| `csvread`, `csvwrite`, `dlmread`, `dlmwrite`, `xlsread` | Older functions |
| `detectImportOptions`, `textscan` | Reading with a detailed format specification |

## Low-level File I/O

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

`fopen`, `fclose`, `fprintf`, `fscanf`, `fgetl`, `fgets`, `fread`, `fwrite`, `fseek`, `ftell` and `feof` are supported.

## JSON, XML, Structs

```m
s = struct('name', "pump", 'rpm', 1450, 'tags', {{"a", "b"}});
txt = jsonencode(s)
back = jsondecode(txt);
writestruct(s, 'pump.xml');
readstruct('pump.xml')
```

## Images and Sound

```m
img = imread('photo.png');        % H×W×3 uint8
gray = rgb2gray(img);
imwrite(gray, 'gray.png');
imshow(gray)
[y, fs] = audioread('sound.wav');
sound(y, fs)                      % play
audiowrite('out.wav', y, fs);
```

Images can be read and written as PNG, JPEG, BMP, GIF, TIFF and PNM, and sound as WAV.

## Archives and the Web

Compress with `zip`, `unzip`, `tar`, `untar`, `gzip` and `gunzip`, and get data from the web with `webread`, `webwrite` and `websave`.

## Files and Folders

Use `dir`, `ls`, `exist`, `isfile`, `isfolder`, `mkdir`, `rmdir`, `delete`, `copyfile`, `movefile`, `fullfile`, `fileparts`, `tempdir` and `tempname`.

> Note: In the web edition, all file paths are restricted to the server's working folder.
