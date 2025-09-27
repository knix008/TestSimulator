namespace PersonInfoApp
{
    public class Person
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public int Age { get; set; }
        public string Email { get; set; } = string.Empty;
        public string Phone { get; set; } = string.Empty;
        public string Address { get; set; } = string.Empty;
        public DateTime CreatedDate { get; set; } = DateTime.Now;

        public Person()
        {
        }

        public Person(string name, int age, string email, string phone, string address)
        {
            Name = name;
            Age = age;
            Email = email;
            Phone = phone;
            Address = address;
        }
    }
}

