### 项目介绍

这是一个为算法竞赛爱好者打造的 VSCode 插件，旨在提升代码书写效率，简化参赛流程，从而节省宝贵的比赛时间。

插件当前支持 C++ 语言，用户可自定义并预设常用的算法模板，保存为 `.hpp` 格式。在参与线上竞赛时，只需通过 `#include "../lib/ds/xxxxx.hpp"` 的方式引入模板文件，便可快速搭建代码结构。

考虑到大多数线上评测系统仅支持提交单个源码文件，本插件提供“一键合并”功能，自动解析并展开所有类似 `#include "../lib/ds/xxxxx.hpp"` 的引用内容，将其替换为对应的完整源代码，生成一个可直接提交的单文件程序，助您专注于算法本身，避免重复性操作。

### 项目使用方法

1. 使用 `git clone` 克隆本项目。

2. `npm install` 安装相关依赖。
3. 使用 `npm run compile` 编译代码。

### 插件使用方法

1. 打开 VScode，安装本插件
2. 安装完成后，打开一个空项目
3. 在空项目中新建 `lib`、`main`、`output` 三个目录。
4. 在 `lib` 目录中新建二级目录，在二级目录中创建模板，即 `.hpp` 文件。
5. 在 `main` 目录下新建 `.cpp` 文件，并使用已经创建好的 `.hpp` 模板文件。
6. 代码书写完成后，使用快捷键（默认 Ctrl + Alt + M）合并代码。
7. 在  `output`  会生成一个同名 `.cpp`，即为合并后的完整代码。

### 例子
![1](https://github.com/GladerJ/TemplateReplaceExtension/blob/main/images/1.png)
![2](https://github.com/GladerJ/TemplateReplaceExtension/blob/main/images/2.png)
![3](https://github.com/GladerJ/TemplateReplaceExtension/blob/main/images/3.png)
![4](https://github.com/GladerJ/TemplateReplaceExtension/blob/main/images/4.png)
![5](https://github.com/GladerJ/TemplateReplaceExtension/blob/main/images/5.png)
