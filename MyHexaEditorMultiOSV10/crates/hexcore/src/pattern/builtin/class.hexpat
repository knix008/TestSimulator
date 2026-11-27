// Java class file, big-endian.
#pragma endian big

enum ConstantTag : u8 {
    Utf8 = 1, Integer = 3, Float = 4, Long = 5, Double = 6, Class = 7, String = 8, Fieldref = 9, Methodref = 10,
    InterfaceMethodref = 11, NameAndType = 12, MethodHandle = 15, MethodType = 16, Dynamic = 17, InvokeDynamic = 18, Module = 19, Package = 20
};

struct CpInfo {
    ConstantTag tag;
    if (tag == 1) { u16 length; char text[length]; }
    else if (tag == 3) s32 value;
    else if (tag == 4) float value;
    else if (tag == 5) s64 value;
    else if (tag == 6) double value;
    else if (tag == 7 || tag == 8 || tag == 16 || tag == 19 || tag == 20) u16 index;
    else if (tag == 15) { u8 referenceKind; u16 referenceIndex; }
    else { u16 index1; u16 index2; }
};

struct ConstantPool {
    let i = 1;
    while (i < constantPoolCount) {
        CpInfo entry [[name("#" + str(i))]];
        if (entry.tag == 5 || entry.tag == 6) i += 2; else i += 1;
    }
} [[color("#8b5cf6")]];

struct AttributeInfo { u16 nameIndex; u32 length; u8 info[length]; };
struct MemberInfo { u16 accessFlags; u16 nameIndex; u16 descriptorIndex; u16 attributesCount; AttributeInfo attributes[attributesCount]; };

u32 magic [[color("#e5484d"), comment("CA FE BA BE")]];
u16 minorVersion;
u16 majorVersion [[comment("52 = Java 8, 61 = Java 17, 65 = Java 21")]];
u16 constantPoolCount;
ConstantPool constantPool;
u16 accessFlags;
u16 thisClass;
u16 superClass;
u16 interfacesCount;
u16 interfaces[interfacesCount];
u16 fieldsCount;
MemberInfo fields[fieldsCount] [[color("#3b82f6")]];
u16 methodsCount;
MemberInfo methods[methodsCount] [[color("#30a46c")]];
u16 attributesCount;
AttributeInfo attributes[attributesCount];
